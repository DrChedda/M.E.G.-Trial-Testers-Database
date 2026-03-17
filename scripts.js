const SUPABASE_URL = 'https://zsmytsalkmtqlxflprnu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SD8kLVdtqkUpRMiUdwWBsQ_u0Gl0qOu';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let documents = [];
let currentCategory = 'All';

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

function filterCategory(cat) {
    currentCategory = cat;
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(cat));
    });
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

    resultsArea.innerHTML = filtered.map(doc => {
        const tagClass = 'tag-' + doc.type;
        
        return `
            <div class="result-item" onclick="openViewer('${doc.id}', '${doc.title}')">
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
}

async function openViewer(id, title) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    let securedUrl = doc.url; 

    if (!securedUrl) {
        const userCode = prompt(`Clearance Required: ${doc.access_required}\nEnter Access Code:`);
        if (!userCode) return;

        console.log(`Attempting RPC for ${id} with code: ${userCode}`);

        const { data, error } = await _supabase.rpc('get_secure_url', { 
            doc_id: id, 
            user_code: String(userCode).trim() 
        });
        
        if (error) {
            console.error("RPC Database Error:", error.message, error.hint);
            alert(`ACCESS ERROR: ${error.message}`);
            return;
        }

        if (!data) {
            console.warn("RPC returned null. Check if passcode matches the Level in access_codes table.");
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
    const code = prompt("Enter AC-X Passcode:");
    if (!code) return;

    const { data: isAdmin, error } = await _supabase.rpc('verify_admin', { user_code: code });
    
    if (error || !isAdmin) {
        alert("Invalid Credentials.");
        return;
    }

    window.adminKey = code;
    document.getElementById('adminModal').style.display = 'flex';
    renderAdminList();
}

function closeAdmin() {
    document.getElementById('adminModal').style.display = 'none';
    document.getElementById('adminForm').reset();
}

function renderAdminList() {
    const listArea = document.getElementById('adminDocList');
    if (!listArea) return;
    
    listArea.innerHTML = documents.map(doc => `
        <div class="admin-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <span class="admin-item-title">${doc.title}</span>
            <div class="admin-btns">
                <button class="edit-btn" onclick="populateEditForm('${doc.id}')" style="background:var(--accent-blue); color:white; border:none; padding:2px 8px; cursor:pointer; margin-right:5px;">Edit</button>
                <button class="delete-btn" onclick="deleteDocument('${doc.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

let editingDocId = null;

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
    submitBtn.innerText = "Save Changes";
    submitBtn.setAttribute("onclick", "updateDocument()");
}

async function updateDocument() {
    const adminPasscode = window.adminKey;
    if (!editingDocId) return;

    const accessValue = document.getElementById('newAccess').value;
    const isProtected = accessValue !== "Public";

    const { data: success, error } = await _supabase.rpc('secure_update_document', {
        admin_code: adminPasscode,
        doc_id: editingDocId,
        new_title: document.getElementById('newTitle').value,
        new_desc: document.getElementById('newDesc').value,
        new_url: document.getElementById('newUrl').value,
        new_cat: document.getElementById('newCategory').value,
        new_type: document.getElementById('newType').value,
        new_access: accessValue,
        new_protected: isProtected
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
    const adminPasscode = window.adminKey;
    if (!adminPasscode) return alert("Session expired.");

    const accessValue = document.getElementById('newAccess').value;
    const isProtected = accessValue !== "Public";

    const { data: success, error } = await _supabase.rpc('secure_add_document', {
        admin_code: adminPasscode,
        new_title: document.getElementById('newTitle').value,
        new_desc: document.getElementById('newDesc').value,
        new_url: document.getElementById('newUrl').value,
        new_cat: document.getElementById('newCategory').value,
        new_type: document.getElementById('newType').value,
        new_access: accessValue,
        new_protected: isProtected
    });

    if (error || !success) {
        alert("Error: " + (error?.message || "Unauthorized"));
    } else {
        alert("Document added successfully!");
        document.getElementById('adminForm').reset();
        await fetchDocuments();
        renderAdminList();
    }
}

async function deleteDocument(id) {
    if (!confirm("Confirm permanent deletion?")) return;

    const { data: success, error } = await _supabase.rpc('secure_delete_document', { 
        doc_id: id, 
        admin_code: window.adminKey 
    });

    if (error || !success) {
        alert("Delete error: Unauthorized.");
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