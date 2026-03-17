const SUPABASE_URL = 'https://zsmytsalkmtqlxflprnu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SD8kLVdtqkUpRMiUdwWBsQ_u0Gl0qOu';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let documents = [], currentCategory = 'All', currentPage = 1, editingDocId = null;
const itemsPerPage = 10;

// --- INITIALIZATION & FETCHING ---

async function init() {
    initTheme();
    await fetchDocuments();
}

async function fetchDocuments() {
    const { data, error } = await _supabase.from('documents').select('*');
    if (error) return console.error('Fetch Error:', error.message);
    documents = data;
    searchDocs();
}

// --- SEARCH & PAGINATION ---

function searchDocs() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const resultsArea = document.getElementById('results');
    if (!resultsArea) return;

    const filtered = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(query) || (doc.description?.toLowerCase().includes(query));
        const matchesCategory = currentCategory === 'All' || doc.category === currentCategory;
        return matchesSearch && matchesCategory;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = 1;

    const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    resultsArea.innerHTML = paginatedItems.map(doc => `
        <div class="result-item" onclick="handleDocClick(event, '${doc.id}', '${doc.title}')">
            <div class="result-header">
                <span class="tag tag-${doc.type}">${doc.type}</span>
                <span class="category-text">${doc.category}</span>
                <span class="title-link">${doc.title}</span>
            </div>
            <div class="result-desc">${doc.description || ''}</div>
            <div class="clearance-tag">Access: ${doc.access_required}</div>
        </div>
    `).join('');

    renderPagination(totalPages, resultsArea);
}

let passcodePromiseResolve = null;

function requestAccessCode(clearanceLevel, savedPass) {
    return new Promise((resolve) => {
        document.getElementById('passcodeReqLevel').innerText = clearanceLevel;
        document.getElementById('passcodeInput').value = savedPass || '';
        document.getElementById('passcodeHelpText').style.display = 'none';
        document.getElementById('passcodePromptModal').style.display = 'flex';
        
        passcodePromiseResolve = resolve;
    });
}

function submitPasscode() {
    const code = document.getElementById('passcodeInput').value;
    document.getElementById('passcodePromptModal').style.display = 'none';
    if (passcodePromiseResolve) passcodePromiseResolve(code);
}

function cancelPasscode() {
    document.getElementById('passcodePromptModal').style.display = 'none';
    if (passcodePromiseResolve) passcodePromiseResolve(null);
}

function togglePasscodeHelp() {
    const help = document.getElementById('passcodeHelpText');
    help.style.display = help.style.display === 'none' ? 'block' : 'none';
}

function renderPagination(totalPages, container) {
    if (totalPages <= 1) return;
    const nav = document.createElement('div');
    nav.className = 'pagination-controls';
    nav.style = "display:flex; justify-content:center; gap:10px; margin-top:30px; padding-bottom:50px;";

    for (let i = 1; i <= totalPages; i++) {
        nav.innerHTML += `<button class="filter-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    container.appendChild(nav);
}

function goToPage(page) {
    currentPage = page;
    searchDocs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterCategory(cat) {
    currentCategory = cat;
    currentPage = 1;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.innerText.includes(cat)));
    searchDocs();
}

// --- VIEWER LOGIC ---

function handleDocClick(event, id, title) {
    if (event.ctrlKey || event.metaKey) {
        event.stopPropagation();
        navigator.clipboard.writeText(id).then(() => alert(`UUID Copied: ${id}`));
    } else {
        openViewer(id, title);
    }
}

async function openViewer(id, title) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    let securedUrl = doc.url; 

    if (!securedUrl) {
        const savedPass = localStorage.getItem(`pass_${doc.access_required}`) || localStorage.getItem('last_used_pass') || '';
        const userCode = await requestAccessCode(doc.access_required, savedPass);
        if (!userCode) return;

        const { data, error } = await _supabase.rpc('get_secure_url', { doc_id: id, provided_passcode: userCode.trim() });
        
        if (error || !data) return alert(error ? `DATABASE ERROR: ${error.message}` : "ACCESS DENIED: Invalid Clearance Level or Code.");
        
        localStorage.setItem(`pass_${doc.access_required}`, userCode);
        localStorage.setItem('last_used_pass', userCode);
        securedUrl = data;
    }

    const modal = document.getElementById('viewerModal');
    if (modal) {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('docIframe').src = securedUrl.includes('docs.google.com') ? securedUrl.split('/edit')[0] + '/preview' : securedUrl;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeViewer() {
    document.getElementById('viewerModal').style.display = 'none';
    document.getElementById('docIframe').src = '';
    document.body.style.overflow = 'auto';
}

// --- ADMIN LOGIC ---

async function openAdmin() {
    const passcode = prompt("Enter AC-X Passcode:", localStorage.getItem('admin_passcode') || '');
    if (!passcode) return;

    const { data: isAdmin } = await _supabase.rpc('verify_admin', { passcode });
    if (!isAdmin) return alert("Invalid Credentials.");

    localStorage.setItem('admin_passcode', passcode);
    window.adminKey = passcode;
    document.getElementById('adminModal').style.display = 'flex';
}

function closeAdmin() {
    document.getElementById('adminModal').style.display = 'none';
    resetAdminForm();
}

const getFormData = () => ({
    title: document.getElementById('newTitle').value,
    desc: document.getElementById('newDesc').value,
    url: document.getElementById('newUrl').value,
    category: document.getElementById('newCategory').value,
    type: document.getElementById('newType').value,
    access: document.getElementById('newAccess').value
});

const setFormData = (doc = {}) => {
    document.getElementById('newTitle').value = doc.title || '';
    document.getElementById('newDesc').value = doc.description || '';
    document.getElementById('newUrl').value = doc.url || '';
    document.getElementById('newCategory').value = doc.category || 'Standard';
    document.getElementById('newType').value = doc.type || 'Document';
    document.getElementById('newAccess').value = doc.access_required || 'Public';
};

async function handleAdminAction(rpcName, payload, successMessage) {
    const { data: success, error } = await _supabase.rpc(rpcName, { passcode: window.adminKey, ...payload });
    if (error || !success) {
        alert("Error: " + (error?.message || "Unauthorized"));
    } else {
        alert(successMessage);
        resetAdminForm();
        await fetchDocuments();
    }
}

async function adminEditByUuid() {
    const id = document.getElementById('targetUuid').value.trim();
    const doc = documents.find(d => d.id === id);
    if (!doc) return alert(id ? "Document not found." : "Please enter a UUID.");

    editingDocId = id;
    let editUrl = doc.url;

    if (doc.access_required !== 'Public') {
        const { data, error } = await _supabase.rpc('admin_get_secure_url', { 
            target_doc_id: id, 
            admin_passcode: window.adminKey 
        });
        
        if (error) {
            console.error("Failed to fetch secure URL:", error.message);
        } else if (data) {
            editUrl = data;
        }
    }

    setFormData({ ...doc, url: editUrl });
    
    const btn = document.querySelector("#adminForm button[type='button']"); 
    if (btn) {
        btn.innerText = `Save Changes (ID: ${id.substring(0,8)})`;
        btn.onclick = updateDocument;
    }
}

function adminDeleteByUuid() {
    const id = document.getElementById('targetUuid').value.trim();
    if (!id || !confirm(`Confirm PERMANENT deletion of record: ${id}`)) return;
    handleAdminAction('secure_delete_document', { doc_id: id }, "Document deleted.");
}

function updateDocument() {
    if (!editingDocId) return;
    const form = getFormData();
    handleAdminAction('secure_update_document', {
        doc_id: editingDocId,
        new_title: form.title, new_desc: form.desc, new_url: form.url,
        new_cat: form.category, new_type: form.type, new_access: form.access,
        new_protected: form.access !== "Public"
    }, "Document updated!");
}

function submitDocument() {
    const form = getFormData();
    handleAdminAction('secure_add_document', {
        new_title: form.title, new_desc: form.desc, new_url: form.url,
        new_cat: form.category, new_type: form.type, new_access: form.access,
        new_protected: form.access !== "Public"
    }, "Document added!");
}

function resetAdminForm() {
    editingDocId = null;
    document.getElementById('adminForm').reset();
    if (document.getElementById('targetUuid')) document.getElementById('targetUuid').value = '';
    
    const btn = document.querySelector("#adminForm button[type='button']");
    if (btn) {
        btn.innerText = "Upload to Database";
        btn.onclick = submitDocument;
    }
}

// --- UI / EVENT LISTENERS ---

function initTheme() {
    document.body.setAttribute('data-theme', localStorage.getItem('meg-theme') || 'light');
}

function toggleTheme() {
    const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('meg-theme', next);
}

window.onscroll = () => {
    const hero = document.getElementById('hero'), sw = document.getElementById('searchWrapper');
    if (hero && sw) sw.classList.toggle("sticky", window.pageYOffset > (hero.offsetHeight - 80));
};

document.addEventListener('DOMContentLoaded', init);