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
        .select('id, title, type, category, description, access_required, is_password_protected'); 

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
        let tagClass = 'tag-' + doc.type;
        let isLocked = doc.is_password_protected && doc.access_required !== "Public";
        let lockStatus = isLocked ? '' : '';
        
        return `
            <div class="result-item" onclick="openViewer('${doc.id}', '${doc.title}')">
                <div class="result-header">
                    <span class="tag ${tagClass}">${doc.type}</span>
                    <span class="category-text">${doc.category}</span>
                    <span class="title-link">${lockStatus}${doc.title}</span>
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

    let userCode = 'public';
    if (doc.is_password_protected && doc.access_required !== "Public") {
        userCode = prompt(`Clearance Required: ${doc.access_required}\nEnter Access Code:`);
        if (!userCode) return;
    }

    const { data: securedUrl, error } = await _supabase.rpc('get_secure_url', { 
        doc_id: id, 
        user_code: userCode 
    });

    if (error || !securedUrl) {
        alert("ACCESS DENIED: Invalid code or system error.");
        return;
    }

    const finalUrl = securedUrl.includes('docs.google.com') 
        ? securedUrl.split('/edit')[0] + '/preview' 
        : securedUrl;

    document.getElementById('modalTitle').innerText = title;
    document.getElementById('docIframe').src = finalUrl;
    document.getElementById('viewerModal').style.display = 'flex';
}

async function verifyAccess(requiredLevel, userCode) {
    const { data: isCorrect, error } = await _supabase.rpc('verify_clearance', {
        req_level: requiredLevel,
        user_code: userCode
    });
    return error ? false : isCorrect;
}

function closeViewer() {
    document.getElementById('viewerModal').style.display = 'none';
    document.getElementById('docIframe').src = '';
    document.body.style.overflow = 'auto';
}

async function openAdmin() {
    const code = prompt("Enter AC-X Admin Passcode:");
    if (!code) return;

    const { data: isAdmin, error } = await _supabase.rpc('verify_admin', { user_code: code });
    
    if (error) {
        console.error("Admin verification error:", error.message);
        return;
    }

    if (isAdmin === true) {
        window.adminKey = code;
        document.getElementById('adminModal').style.display = 'flex';
        renderAdminList();
    } else {
        alert("Invalid Admin Credentials.");
    }
}

function closeAdmin() {
    document.getElementById('adminModal').style.display = 'none';
    document.getElementById('adminForm').reset();
}

function renderAdminList() {
    const listArea = document.getElementById('adminDocList');
    if (!listArea) return;
    
    listArea.innerHTML = documents.map(doc => `
        <div class="admin-item">
            <span class="admin-item-title">${doc.title}</span>
            <button class="delete-btn" onclick="deleteDocument('${doc.id}')">Delete</button>
        </div>
    `).join('');
}

async function deleteDocument(id) {
    if (!confirm("Confirm permanent deletion of this record?")) return;

    const { data: success, error } = await _supabase.rpc('secure_delete_document', { 
        doc_id: id, 
        admin_code: window.adminKey 
    });

    if (error || !success) {
        alert("Delete error: Unauthorized or invalid session.");
    } else {
        await fetchDocuments();
        renderAdminList();
    }
}

async function submitDocument() {
    const accessValue = document.getElementById('newAccess').value;
    const isProtected = accessValue !== "Public";

    const { data: success, error } = await _supabase.rpc('secure_add_document', {
        admin_code: window.adminKey,
        new_title: document.getElementById('newTitle').value,
        new_desc: document.getElementById('newDesc').value,
        new_url: document.getElementById('newUrl').value,
        new_cat: document.getElementById('newCategory').value,
        new_type: document.getElementById('newType').value,
        new_access: accessValue,
        new_protected: isProtected
    });

    if (error || !success) {
        alert("Error: Unauthorized or database failure.");
    } else {
        alert("Document successfully added to secure storage!");
        document.getElementById('adminForm').reset();
        await fetchDocuments();
        renderAdminList();
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('meg-theme') || 'light';
    if (document.body) {
        document.body.setAttribute('data-theme', savedTheme);
    }
}

function toggleTheme() {
    const body = document.body;
    if (!body) return;
    const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', next);
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