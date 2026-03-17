const SUPABASE_URL = 'https://zsmytsalkmtqlxflprnu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SD8kLVdtqkUpRMiUdwWBsQ_u0Gl0qOu';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let documents = [];
let currentCategory = 'All';
let currentPage = 1;
const itemsPerPage = 10;
let editingDocId = null;

async function init() {
    initTheme();
    await fetchDocuments();
}

async function fetchDocuments() {
    const { data, error } = await _supabase
        .from('documents')
        .select('id, title, type, category, description, access_required, is_password_protected, url'); 

    if (error) {
        console.error('Fetch Error:', error.message);
        return;
    }
    documents = data;
    searchDocs();
}

function searchDocs() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const resultsArea = document.getElementById('results');
    if (!resultsArea) return;

    const filtered = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(query) || 
                              (doc.description && doc.description.toLowerCase().includes(query));
        const matchesCategory = currentCategory === 'All' || doc.category === currentCategory;
        return matchesSearch && matchesCategory;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    resultsArea.innerHTML = paginatedItems.map(doc => {
        const tagClass = 'tag-' + doc.type;
        return `
            <div class="result-item" onclick="handleDocClick(event, '${doc.id}', '${doc.title}')">
                <div class="result-header">
                    <span class="tag ${tagClass}">${doc.type}</span>
                    <span class="category-text">${doc.category}</span>
                    <span class="title-link">${doc.title}</span>
                </div>
                <div class="result-desc">${doc.description || ''}</div>
                <div class="clearance-tag">Access: ${doc.access_required}</div>
            </div>
        `;
    }).join('');

    renderPagination(totalPages);
}

function handleDocClick(event, id, title) {
    if (event.ctrlKey || event.metaKey) {
        event.stopPropagation();
        navigator.clipboard.writeText(id).then(() => {
            alert(`UUID Copied: ${id}`);
        });
    } else {
        openViewer(id, title);
    }
}

function renderPagination(totalPages) {
    const resultsArea = document.getElementById('results');
    if (totalPages <= 1) return;

    const nav = document.createElement('div');
    nav.className = 'pagination-controls';
    nav.style = "display:flex; justify-content:center; gap:10px; margin-top:30px; padding-bottom:50px;";

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = `filter-btn ${i === currentPage ? 'active' : ''}`;
        btn.onclick = () => {
            currentPage = i;
            searchDocs();
            window.scrollTo({top: 0, behavior: 'smooth'});
        };
        nav.appendChild(btn);
    }
    resultsArea.appendChild(nav);
}

function filterCategory(cat) {
    currentCategory = cat;
    currentPage = 1;
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(cat));
    });
    searchDocs();
}

async function openViewer(id, title) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    let securedUrl = doc.url; 

    if (!securedUrl) {
        const userCode = prompt(`Clearance Required: ${doc.access_required}\nEnter Access Code:`);
        if (!userCode) return;

        const { data, error } = await _supabase.rpc('get_secure_url', { 
            doc_id: id, 
            passcode: String(userCode).trim() 
        });
        
        if (error) {
            alert(`ACCESS ERROR: ${error.message}`);
            return;
        }

        if (!data) {
            alert("ACCESS DENIED: Invalid Clearance Level or Code.");
            return;
        }
        securedUrl = data;
    }

    const finalUrl = securedUrl.includes('docs.google.com') 
        ? securedUrl.split('/edit')[0] + '/preview' 
        : securedUrl;

    const modal = document.getElementById('viewerModal');
    const iframe = document.getElementById('docIframe');
    
    if (modal && iframe) {
        document.getElementById('modalTitle').innerText = title;
        iframe.src = finalUrl;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeViewer() {
    document.getElementById('viewerModal').style.display = 'none';
    document.getElementById('docIframe').src = '';
    document.body.style.overflow = 'auto';
}

async function openAdmin() {
    const passcode = prompt("Enter AC-X Passcode:");
    if (!passcode) return;

    const { data: isAdmin, error } = await _supabase.rpc('verify_admin', { passcode: passcode });
    
    if (error || !isAdmin) {
        alert("Invalid Credentials.");
        return;
    }

    window.adminKey = passcode;
    document.getElementById('adminModal').style.display = 'flex';
    renderAdminList();
}

function closeAdmin() {
    document.getElementById('adminModal').style.display = 'none';
    resetAdminForm();
}

function renderAdminList() {
    const listArea = document.getElementById('adminDocList');
    if (!listArea) return;
    
    listArea.innerHTML = documents.map(doc => `
        <div class="admin-item" title="ID: ${doc.id}">
            <div style="display:flex; flex-direction:column; max-width:60%;">
                <span class="admin-item-title">${doc.title}</span>
                <span style="font-size:10px; color:var(--text-dim); font-family:monospace;">${doc.id.substring(0,8)}...</span>
            </div>
            <div class="admin-btns">
                <button class="edit-btn" onclick="populateEditForm('${doc.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteDocument('${doc.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function populateEditForm(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    editingDocId = id;
    document.getElementById('newTitle').value = doc.title;
    document.getElementById('newDesc').value = doc.description || '';
    document.getElementById('newUrl').value = doc.url || '';
    document.getElementById('newCategory').value = doc.category;
    document.getElementById('newType').value = doc.type;
    document.getElementById('newAccess').value = doc.access_required;

    const submitBtn = document.querySelector("button[onclick='submitDocument()']");
    if (submitBtn) {
        submitBtn.innerText = "Save Changes";
        submitBtn.setAttribute("onclick", "updateDocument()");
    }
}

async function updateDocument() {
    if (!editingDocId) return;
    const accessValue = document.getElementById('newAccess').value;
    const { data: success, error } = await _supabase.rpc('secure_update_document', {
        doc_id: editingDocId,
        new_access: accessValue,
        new_cat: document.getElementById('newCategory').value,
        new_desc: document.getElementById('newDesc').value,
        new_protected: accessValue !== "Public",
        new_title: document.getElementById('newTitle').value,
        new_type: document.getElementById('newType').value,
        new_url: document.getElementById('newUrl').value,
        passcode: window.adminKey 
    });

    if (error || !success) {
        alert("Update Error: " + (error?.message || "Unauthorized"));
    } else {
        alert("Document updated!");
        resetAdminForm();
        await fetchDocuments();
        renderAdminList();
    }
}

function resetAdminForm() {
    editingDocId = null;
    document.getElementById('adminForm').reset();
    const submitBtn = document.querySelector("button[onclick='updateDocument()']");
    if(submitBtn) {
        submitBtn.innerText = "Upload to Database";
        submitBtn.setAttribute("onclick", "submitDocument()");
    }
}

async function submitDocument() {
    const accessValue = document.getElementById('newAccess').value;
    const { data: success, error } = await _supabase.rpc('secure_add_document', {
        passcode: window.adminKey,
        new_title: document.getElementById('newTitle').value,
        new_desc: document.getElementById('newDesc').value,
        new_url: document.getElementById('newUrl').value,
        new_cat: document.getElementById('newCategory').value,
        new_type: document.getElementById('newType').value,
        new_access: accessValue,
        new_protected: accessValue !== "Public"
    });

    if (error || !success) {
        alert("Error: " + (error?.message || "Unauthorized"));
    } else {
        alert("Document added!");
        document.getElementById('adminForm').reset();
        await fetchDocuments();
        renderAdminList();
    }
}

async function deleteDocument(id) {
    if (!confirm(`Confirm deletion for UUID: ${id}`)) return;
    const { data: success, error } = await _supabase.rpc('secure_delete_document', { 
        doc_id: id, 
        passcode: window.adminKey 
    });

    if (error || !success) {
        alert("Delete error: " + (error?.message || "Unauthorized"));
    } else {
        await fetchDocuments();
        renderAdminList();
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('meg-theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('meg-theme', next);
}

window.onscroll = function() {
    const hero = document.getElementById('hero');
    const sw = document.getElementById('searchWrapper');
    if (hero && sw) {
        if (window.pageYOffset > (hero.offsetHeight - 80)) sw.classList.add("sticky");
        else sw.classList.remove("sticky");
    }
};

document.addEventListener('DOMContentLoaded', init);