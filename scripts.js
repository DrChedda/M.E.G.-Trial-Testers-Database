const SUPABASE_URL = 'https://zsmytsalkmtqlxflprnu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SD8kLVdtqkUpRMiUdwWBsQ_u0Gl0qOu';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let documents = [], currentCategory = 'All', currentPage = 1, editingDocId = null;
const itemsPerPage = 10;

// --- INITIALIZATION & FETCHING ---

async function init() {
    initTheme();
    initLogoSpin();
    await fetchDocuments();
}

async function fetchDocuments() {
    const { data, error } = await _supabase.from('documents').select('*');
    if (error) return console.error('Fetch Error:', error.message);
    documents = data;
    searchDocs();
}

// --- SORTING PRIORITIES ---

const CATEGORY_ORDER = { 'General': 1, 'Research': 2, 'Theory': 3, 'Other': 4 };
const TYPE_ORDER = { 'doc': 1, 'sheet': 2, 'slide': 3, 'other': 4 };
const ACCESS_ORDER = { 'Public': 1, 'AC-1': 2, 'AC-2': 3, 'AC-V': 4, 'AC-X': 5 };

// --- SEARCH & PAGINATION ---

function searchDocs() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const resultsArea = document.getElementById('results');
    if (!resultsArea) return;

    let filtered = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(query) || 
                             (doc.description?.toLowerCase().includes(query));
        const matchesCategory = currentCategory === 'All' || doc.category === currentCategory;
        return matchesSearch && matchesCategory;
    });

    filtered.sort((a, b) => {
        const catA = CATEGORY_ORDER[a.category] || 99;
        const catB = CATEGORY_ORDER[b.category] || 99;
        if (catA !== catB) return catA - catB;

        const accA = ACCESS_ORDER[a.access_required] || 99;
        const accB = ACCESS_ORDER[b.access_required] || 99;
        if (accA !== accB) return accA - accB;

        const typeA = TYPE_ORDER[a.type] || 99;
        const typeB = TYPE_ORDER[b.type] || 99;
        if (typeA !== typeB) return typeA - typeB;

        return a.title.localeCompare(b.title);
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
        lockScroll();
        
        passcodePromiseResolve = resolve;
    });
}

function openUpdateLog() {
    document.getElementById('logModal').style.display = 'flex';
    lockScroll();
}

function closeUpdateLog() {
    document.getElementById('logModal').style.display = 'none';
    unlockScroll();
}

function submitPasscode() {
    const code = document.getElementById('passcodeInput').value;
    document.getElementById('passcodePromptModal').style.display = 'none';
    unlockScroll();
    if (passcodePromiseResolve) passcodePromiseResolve(code);
}

function cancelPasscode() {
    document.getElementById('passcodePromptModal').style.display = 'none';
    unlockScroll();
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

    let securedUrl = null;

    if (doc.access_required && doc.access_required !== 'Public') {
        let savedPass = localStorage.getItem('highest_access_pass') || 
                        localStorage.getItem(`pass_${doc.access_required}`) || '';

        const userCode = await requestAccessCode(doc.access_required, savedPass);
        if (!userCode) return;

        const { data, error } = await _supabase.rpc('get_secure_url', { 
            doc_id: id, 
            provided_passcode: userCode.trim() 
        });
        
        if (error || !data) {
            unlockScroll();
            return alert("ACCESS DENIED: Insufficient clearance level or invalid code.");
        }
        
        localStorage.setItem('highest_access_pass', userCode.trim());
        localStorage.setItem(`pass_${doc.access_required}`, userCode.trim());
        securedUrl = data;
    } else {
        securedUrl = doc.url;
    }

    if (!securedUrl) return;

    const modal = document.getElementById('viewerModal');
    if (modal) {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('docIframe').src = securedUrl.includes('docs.google.com') 
            ? securedUrl.split('/edit')[0] + '/preview' 
            : securedUrl;
        modal.style.display = 'flex';
        lockScroll();
    }
}

function openInNewTab() {
    const iframe = document.getElementById('docIframe');
    const cleanUrl = iframe.src.replace('/preview', '/view');
    window.open(cleanUrl, '_blank');
}

function closeViewer() {
    document.getElementById('viewerModal').style.display = 'none';
    document.getElementById('docIframe').src = '';
    unlockScroll();
}

// --- ADMIN LOGIC ---

async function openAdmin() {
    closeUpdateLog();
    
    const passcode = prompt("Enter AC-X Passcode:", localStorage.getItem('admin_passcode') || '');
    if (!passcode) return;

    const { data: isAdmin } = await _supabase.rpc('verify_admin', { passcode });
    if (!isAdmin) return alert("Invalid Credentials.");

    localStorage.setItem('admin_passcode', passcode);
    window.adminKey = passcode;
    document.getElementById('adminModal').style.display = 'flex';
    lockScroll();
}

function closeAdmin() {
    document.getElementById('adminModal').style.display = 'none';
    unlockScroll();
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
    const currentTheme = document.body.getAttribute('data-theme');
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('meg-theme', next);
}

function initLogoSpin() {
    let isspinning = false;
    const logo = document.querySelector('.nav-logo');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', () => {
            if (!isspinning) {
                isspinning = true;
                logo.classList.add('spinning');
                setTimeout(() => {
                    logo.classList.remove('spinning');
                    isspinning = false;
                }, 600);
            }
        });
    }
}

function toggleDropdown() {
    document.getElementById("optionsDropdown").classList.toggle("show");
}

window.onclick = function(event) {
    if (!event.target.matches('.options-btn')) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            let openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}

window.onscroll = () => {
    const hero = document.getElementById('hero');
    const sw = document.getElementById('searchWrapper');
    if (hero && sw) {
        const isSticky = window.pageYOffset > (hero.offsetHeight - 60);
        sw.classList.toggle("sticky", isSticky);
    }
};

function lockScroll() {
    const scrollY = window.scrollY;
    document.body.style.setProperty('--scroll-y', `-${scrollY}px`);
    document.body.classList.add('modal-open');
}

function unlockScroll() {
    const scrollY = document.body.style.getPropertyValue('--scroll-y');
    document.body.classList.remove('modal-open');
    document.body.style.setProperty('--scroll-y', '');
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
}

document.addEventListener('DOMContentLoaded', init);