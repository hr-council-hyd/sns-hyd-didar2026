
// =============================================
// UPDATE THIS URL AFTER EACH NEW DEPLOYMENT
// =============================================
var API_URL = 'https://script.google.com/macros/s/AKfycbzWNkYic1fs8YepBGXvqEK6wLkrt4a5orX1pe13dZFry6CH9kQJCXLTl3ZHHW0alnC5/exec';

var allMembers = [];
var adminMembers = [];
var currentFilter = 'all';
var adminFilter = 'all';
var currentTeam = '';
var isAdmin = false;
var editingRowIndex = null;
var selectedFileBase64 = null;
var selectedFileName = '';
var selectedFileMime = '';
var existingImageUrl = '';
var cachedProcurement = null;
var jsonpCounter = 0;

document.getElementById('password').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') handleLogin();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function() {});
}

// ============ API HELPERS (JSONP - BYPASSES CORS) ============

function apiGet(params) {
  return new Promise(function(resolve, reject) {
    jsonpCounter++;
    var cbName = '__cb_' + jsonpCounter + '_' + Date.now();
    var url = API_URL + '?' + Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&') + '&callback=' + cbName;

    var timeout = setTimeout(function() {
      cleanup();
      reject(new Error('Request timeout'));
    }, 30000);

    window[cbName] = function(data) {
      cleanup();
      resolve(data);
    };

    function cleanup() {
      clearTimeout(timeout);
      try { delete window[cbName]; } catch(ex) { window[cbName] = undefined; }
      var el = document.getElementById(cbName);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    var script = document.createElement('script');
    script.id = cbName;
    script.src = url;
    script.onerror = function() {
      cleanup();
      reject(new Error('Network error'));
    };
    document.body.appendChild(script);
  });
}

function apiPost(data) {
  return new Promise(function(resolve, reject) {
    jsonpCounter++;
    var cbName = '__cb_' + jsonpCounter + '_' + Date.now();
    var url = API_URL + '?postData=' + encodeURIComponent(JSON.stringify(data)) + '&callback=' + cbName;

    var timeout = setTimeout(function() {
      cleanup();
      resolve({ success: true });
    }, 30000);

    window[cbName] = function(responseData) {
      cleanup();
      resolve(responseData);
    };

    function cleanup() {
      clearTimeout(timeout);
      try { delete window[cbName]; } catch(ex) { window[cbName] = undefined; }
      var el = document.getElementById(cbName);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    var script = document.createElement('script');
    script.id = cbName;
    script.src = url;
    script.onerror = function() {
      cleanup();
      resolve({ success: true });
    };
    document.body.appendChild(script);
  });
}

// ============ LOGIN ============

function handleLogin() {
  var userId = document.getElementById('userId').value;
  var password = document.getElementById('password').value;
  var btn = document.getElementById('loginBtn');
  if (!userId) { showError('Please select a team'); return; }
  if (!password) { showError('Please enter password'); return; }
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  document.getElementById('errorMsg').style.display = 'none';

  apiGet({ action: 'login', userId: userId, password: password })
    .then(function(result) {
      if (result.success) {
        document.getElementById('loginPage').style.display = 'none';
        isAdmin = result.isAdmin;
        currentTeam = result.team;
        if (result.isAdmin) {
          document.getElementById('adminDashboard').style.display = 'block';
          loadAdminDashboard();
        } else {
          document.getElementById('dashboard').style.display = 'block';
          document.getElementById('teamTitle').textContent = result.team;
          loadTeamData(result.team);
        }
      } else {
        showError('Invalid password');
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    })
    .catch(function() {
      showError('Connection error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Login';
    });
}

function showError(msg) {
  var el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

// ============ TABS ============

function switchTab(tab, el) {
  var tabs = document.querySelectorAll('#dashboard .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  el.classList.add('active');
  document.getElementById('volunteersTab').classList.remove('active');
  document.getElementById('procurementTab').classList.remove('active');
  if (tab === 'volunteers') {
    document.getElementById('volunteersTab').classList.add('active');
  } else {
    document.getElementById('procurementTab').classList.add('active');
    if (cachedProcurement) {
      document.getElementById('procLoading').style.display = 'none';
      document.getElementById('procTable').style.display = 'table';
      renderProcTable(cachedProcurement.items, 'procBody', false);
    } else {
      loadProcurement();
    }
  }
}

function switchAdminTab(tab, el) {
  var tabs = document.querySelectorAll('#adminDashboard .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  el.classList.add('active');
  document.getElementById('adminVolunteersTab').classList.remove('active');
  document.getElementById('adminProcurementTab').classList.remove('active');
  if (tab === 'volunteers') {
    document.getElementById('adminVolunteersTab').classList.add('active');
  } else {
    document.getElementById('adminProcurementTab').classList.add('active');
    loadAdminProcurement();
  }
}

// ============ ADMIN ============

function loadAdminDashboard() {
  apiGet({ action: 'getAllTeamsData' })
    .then(function(result) {
      document.getElementById('adminTotalCount').textContent = result.grandTotal.total;
      document.getElementById('adminL1Count').textContent = result.grandTotal.l1;
      document.getElementById('adminL2Count').textContent = result.grandTotal.l2;
      document.getElementById('adminL3Count').textContent = result.grandTotal.l3;
      var container = document.getElementById('teamCardsContainer');
      var html = '';
      for (var i = 0; i < result.teams.length; i++) {
        var team = result.teams[i];
        html += '<div class="team-card" onclick="adminViewTeam(\'' + team.teamName.replace(/'/g, "\\'") + '\')">';
        html += '<h4>' + team.teamName + '</h4><div class="team-stats">';
        html += '<div class="team-stat total"><div class="num">' + team.total + '</div><div class="lbl">Total</div></div>';
        html += '<div class="team-stat s-l1"><div class="num">' + team.l1 + '</div><div class="lbl">L1</div></div>';
        html += '<div class="team-stat s-l2"><div class="num">' + team.l2 + '</div><div class="lbl">L2</div></div>';
        html += '<div class="team-stat s-l3"><div class="num">' + team.l3 + '</div><div class="lbl">L3</div></div>';
        html += '</div></div>';
      }
      container.innerHTML = html;
    });
}

function adminViewTeam(teamName) {
  document.getElementById('adminTeamCards').style.display = 'none';
  document.getElementById('adminDetailView').style.display = 'block';
  document.getElementById('adminDetailTitle').textContent = teamName;
  document.getElementById('adminLoading').style.display = 'block';
  document.getElementById('adminTeamTable').style.display = 'none';
  adminFilter = 'all';
  apiGet({ action: 'getTeamData', team: teamName })
    .then(function(result) {
      document.getElementById('adminLoading').style.display = 'none';
      document.getElementById('adminTeamTable').style.display = 'table';
      if (result.error) return;
      adminMembers = result.members;
      renderAdminTable(adminMembers);
    });
}

function showAdminOverview() {
  document.getElementById('adminTeamCards').style.display = 'block';
  document.getElementById('adminDetailView').style.display = 'none';
}

function renderAdminTable(members) {
  var tbody = document.getElementById('adminTableBody');
  var html = '';
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    html += '<tr><td>' + (i+1) + '</td><td><strong>' + m.firstName + '</strong> ' + m.middleName + ' ' + m.lastName + '</td>';
    html += '<td>' + (m.phone||'-') + '</td><td>' + (m.center||'-') + '</td><td>' + (m.dob||'-') + '</td>';
    html += '<td><span class="level-badge level-' + m.level + '">' + (m.level||'-') + '</span></td>';
    html += '<td>' + (m.didar||'-') + '</td><td>' + (m.committment||'-') + '</td></tr>';
  }
  tbody.innerHTML = html;
}

function filterAdminTable() {
  var search = document.getElementById('adminSearchInput').value.toLowerCase();
  var filtered = [];
  for (var i = 0; i < adminMembers.length; i++) {
    var m = adminMembers[i];
    var lvl = m.level.toUpperCase().trim();
    if (adminFilter !== 'all' && lvl !== adminFilter && lvl !== adminFilter.replace('L','')) continue;
    if (search) {
      var full = (m.firstName + ' ' + m.middleName + ' ' + m.lastName).toLowerCase();
      if (full.indexOf(search) === -1 && (m.phone||'').indexOf(search) === -1 && (m.center||'').toLowerCase().indexOf(search) === -1) continue;
    }
    filtered.push(m);
  }
  renderAdminTable(filtered);
}

function setAdminFilter(level, btn) {
  adminFilter = level;
  var buttons = document.querySelectorAll('#adminDetailView .filter-btn');
  for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('active');
  btn.classList.add('active');
  filterAdminTable();
}

// ============ VOLUNTEERS ============

function loadTeamData(teamName) {
  apiGet({ action: 'getTeamData', team: teamName })
    .then(function(result) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('teamTable').style.display = 'table';
      if (result.error) {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading').innerHTML = '<p style="color:red;">' + result.error + '</p>';
        document.getElementById('teamTable').style.display = 'none';
        return;
      }
      allMembers = result.members;
      document.getElementById('totalCount').textContent = result.stats.total;
      document.getElementById('l1Count').textContent = result.stats.l1;
      document.getElementById('l2Count').textContent = result.stats.l2;
      document.getElementById('l3Count').textContent = result.stats.l3;
      renderTable(allMembers);
    });
  apiGet({ action: 'getProcurement', team: teamName })
    .then(function(result) { cachedProcurement = result; });
}

function renderTable(members) {
  var tbody = document.getElementById('tableBody');
  var html = '';
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    html += '<tr><td>' + (i+1) + '</td><td><strong>' + m.firstName + '</strong> ' + m.middleName + ' ' + m.lastName + '</td>';
    html += '<td>' + (m.phone||'-') + '</td><td>' + (m.center||'-') + '</td><td>' + (m.dob||'-') + '</td>';
    html += '<td><span class="level-badge level-' + m.level + '">' + (m.level||'-') + '</span></td>';
    html += '<td>' + (m.didar||'-') + '</td><td>' + (m.committment||'-') + '</td></tr>';
  }
  tbody.innerHTML = html;
}

function filterTable() {
  var search = document.getElementById('searchInput').value.toLowerCase();
  var filtered = [];
  for (var i = 0; i < allMembers.length; i++) {
    var m = allMembers[i];
    var lvl = m.level.toUpperCase().trim();
    if (currentFilter !== 'all' && lvl !== currentFilter && lvl !== currentFilter.replace('L','')) continue;
    if (search) {
      var full = (m.firstName + ' ' + m.middleName + ' ' + m.lastName).toLowerCase();
      if (full.indexOf(search) === -1 && (m.phone||'').indexOf(search) === -1 && (m.center||'').toLowerCase().indexOf(search) === -1) continue;
    }
    filtered.push(m);
  }
  renderTable(filtered);
}

function setFilter(level, btn) {
  currentFilter = level;
  var buttons = document.querySelectorAll('#dashboard .controls .filter-btn');
  for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('active');
  btn.classList.add('active');
  filterTable();
}

// ============ PROCUREMENT ============

function loadProcurement() {
  document.getElementById('procLoading').style.display = 'block';
  document.getElementById('procTable').style.display = 'none';
  apiGet({ action: 'getProcurement', team: currentTeam })
    .then(function(result) {
      document.getElementById('procLoading').style.display = 'none';
      document.getElementById('procTable').style.display = 'table';
      cachedProcurement = result;
      renderProcTable(result.items, 'procBody', false);
    });
}

function loadAdminProcurement() {
  document.getElementById('adminProcLoading').style.display = 'block';
  document.getElementById('adminProcTable').style.display = 'none';
  apiGet({ action: 'getProcurement', team: 'ALL' })
    .then(function(result) {
      document.getElementById('adminProcLoading').style.display = 'none';
      document.getElementById('adminProcTable').style.display = 'table';
      renderProcTable(result.items, 'adminProcBody', true);
    });
}

function renderProcTable(items, tbodyId, showTeam) {
  var tbody = document.getElementById(tbodyId);
  var html = '';
  if (items.length === 0) {
    var cols = showTeam ? 9 : 8;
    html = '<tr><td colspan="' + cols + '" style="text-align:center;color:#666;padding:30px;">No procurement items yet.</td></tr>';
  } else {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var priorityClass = 'priority-' + item.priority.toLowerCase();
      var statusClass = 'status-' + item.status.toLowerCase();
      html += '<tr>';
      if (showTeam) html += '<td><strong>' + item.team + '</strong></td>';
      html += '<td>' + item.itemName + '</td>';
      html += '<td>' + item.category + '</td>';
      html += '<td><strong>' + item.quantity + '</strong></td>';
      html += '<td><span class="' + priorityClass + '">' + item.priority + '</span></td>';
      html += '<td>' + (item.notes || '-') + '</td>';
      if (item.imageUrl && item.imageUrl !== '' && item.imageUrl !== 'undefined') {
        html += '<td><a class="img-link" onclick="viewImage(\'' + item.imageUrl + '\',\'' + item.itemName.replace(/'/g,"\\'") + '\')">📷 View</a></td>';
      } else {
        html += '<td style="color:#ccc;">-</td>';
      }
      html += '<td><span class="status-badge ' + statusClass + '">' + item.status + '</span></td>';
      html += '<td>';
      if (showTeam) {
        html += '<select onchange="updateStatus(' + item.rowIndex + ', this.value)" style="padding:4px;border-radius:4px;border:1px solid #ddd;font-size:12px;">';
        html += '<option value="Pending"' + (item.status==='Pending'?' selected':'') + '>Pending</option>';
        html += '<option value="Approved"' + (item.status==='Approved'?' selected':'') + '>Approved</option>';
        html += '<option value="Delivered"' + (item.status==='Delivered'?' selected':'') + '>Delivered</option>';
        html += '</select>';
      } else {
        html += '<button class="edit-btn" onclick="openEditModal(' + item.rowIndex + ',\'' + item.itemName.replace(/'/g,"\\'") + '\',\'' + item.category + '\',' + item.quantity + ',\'' + item.priority + '\',\'' + (item.notes||'').replace(/'/g,"\\'").replace(/\n/g,' ') + '\',\'' + (item.imageUrl||'') + '\')">✏️ Edit</button>';
      }
      html += '</td></tr>';
    }
  }
  tbody.innerHTML = html;
}

function extractFileId(url) {
  if (!url) return '';
  var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  match = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return '';
}

function updateStatus(rowIndex, status) {
  apiPost({ action: 'updateStatus', rowIndex: rowIndex, status: status })
    .then(function() { loadAdminProcurement(); });
}

// ============ IMAGE ============

function handleFileSelect(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('Image must be less than 5MB');
    event.target.value = '';
    return;
  }
  selectedFileName = file.name;
  selectedFileMime = file.type;
  var reader = new FileReader();
  reader.onload = function(e) {
    selectedFileBase64 = e.target.result.split(',')[1];
    document.getElementById('uploadArea').classList.add('has-file');
    document.getElementById('fileName').textContent = '✅ ' + file.name;
    document.getElementById('uploadPreview').src = e.target.result;
    document.getElementById('uploadPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function viewImage(url, itemName) {
  var fileId = extractFileId(url);
  var imgSrc = fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800' : url;
  document.getElementById('imageModalTitle').textContent = itemName;
  document.getElementById('imageModalImg').src = imgSrc;
  document.getElementById('imageModalLink').href = url;
  document.getElementById('imageModal').classList.add('show');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.remove('show');
}

// ============ MODAL ============

function openAddModal() {
  editingRowIndex = null;
  existingImageUrl = '';
  selectedFileBase64 = null;
  selectedFileName = '';
  document.getElementById('modalTitle').textContent = 'Add Procurement Item';
  document.getElementById('procItemName').value = '';
  document.getElementById('procCategory').value = 'Communication';
  document.getElementById('procQuantity').value = '';
  document.getElementById('procPriority').value = 'Medium';
  document.getElementById('procNotes').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  document.getElementById('uploadArea').classList.remove('has-file');
  document.getElementById('fileName').textContent = '';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('fileInput').value = '';
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('saveBtn').textContent = 'Save';
  document.getElementById('procModal').classList.add('show');
}

function openEditModal(rowIndex, itemName, category, quantity, priority, notes, imageUrl) {
  editingRowIndex = rowIndex;
  existingImageUrl = imageUrl || '';
  selectedFileBase64 = null;
  selectedFileName = '';
  document.getElementById('modalTitle').textContent = 'Edit Procurement Item';
  document.getElementById('procItemName').value = itemName;
  document.getElementById('procCategory').value = category;
  document.getElementById('procQuantity').value = quantity;
  document.getElementById('procPriority').value = priority;
  document.getElementById('procNotes').value = notes;
  document.getElementById('deleteBtn').style.display = 'block';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('fileInput').value = '';
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('saveBtn').textContent = 'Save';
  if (imageUrl && imageUrl !== '' && imageUrl !== 'undefined') {
    document.getElementById('uploadArea').classList.add('has-file');
    document.getElementById('fileName').textContent = '✅ Image attached (select new to replace)';
    var fileId = extractFileId(imageUrl);
    if (fileId) {
      document.getElementById('uploadPreview').src = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w200';
      document.getElementById('uploadPreview').style.display = 'block';
    } else {
      document.getElementById('uploadPreview').style.display = 'none';
    }
  } else {
    document.getElementById('uploadArea').classList.remove('has-file');
    document.getElementById('fileName').textContent = '';
    document.getElementById('uploadPreview').style.display = 'none';
  }
  document.getElementById('procModal').classList.add('show');
}

function closeModal() {
  document.getElementById('procModal').classList.remove('show');
}

function saveItem() {
  var itemName = document.getElementById('procItemName').value.trim();
  var category = document.getElementById('procCategory').value;
  var quantity = parseInt(document.getElementById('procQuantity').value);
  var priority = document.getElementById('procPriority').value;
  var notes = document.getElementById('procNotes').value.trim();
  if (!itemName) { alert('Please enter item name'); return; }
  if (!quantity || quantity < 1) { alert('Please enter valid quantity'); return; }
  var saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  if (selectedFileBase64) {
    document.getElementById('uploadProgress').style.display = 'block';
    var timestamp = new Date().getTime();
    var cleanName = currentTeam.replace(/[^a-zA-Z0-9]/g, '_') + '_' + timestamp + '_' + selectedFileName;
    apiPost({ action: 'uploadImage', base64Data: selectedFileBase64, fileName: cleanName, mimeType: selectedFileMime })
      .then(function(uploadResult) {
        document.getElementById('uploadProgress').style.display = 'none';
        var imgUrl = (uploadResult && uploadResult.url) ? uploadResult.url : '';
        saveToSheet(itemName, category, quantity, priority, notes, imgUrl);
      })
      .catch(function() {
        document.getElementById('uploadProgress').style.display = 'none';
        saveToSheet(itemName, category, quantity, priority, notes, '');
      });
  } else {
    saveToSheet(itemName, category, quantity, priority, notes, existingImageUrl || '');
  }
}

function saveToSheet(itemName, category, quantity, priority, notes, imageUrl) {
  var data;
  if (editingRowIndex) {
    data = { action: 'updateProcurement', rowIndex: editingRowIndex, itemName: itemName, category: category, quantity: quantity, priority: priority, notes: notes, imageUrl: imageUrl };
  } else {
    data = { action: 'addProcurement', team: currentTeam, itemName: itemName, category: category, quantity: quantity, priority: priority, notes: notes, imageUrl: imageUrl };
  }
  apiPost(data)
    .then(function() {
      closeModal();
      cachedProcurement = null;
      loadProcurement();
    })
    .catch(function() {
      alert('Save failed. Please try again.');
      document.getElementById('saveBtn').disabled = false;
      document.getElementById('saveBtn').textContent = 'Save';
    });
}

function deleteItem() {
  if (!confirm('Are you sure you want to delete this item?')) return;
  closeModal();
  apiPost({ action: 'deleteProcurement', rowIndex: editingRowIndex })
    .then(function() {
      cachedProcurement = null;
      loadProcurement();
    });
}

// ============ LOGOUT ============

function handleLogout() {
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('userId').value = '';
  document.getElementById('password').value = '';
  document.getElementById('loginBtn').disabled = false;
  document.getElementById('loginBtn').textContent = 'Login';
  document.getElementById('teamTable').style.display = 'none';
  document.getElementById('loading').style.display = 'block';
  document.getElementById('loading').innerHTML = '<div class="spinner"></div><p>Loading team data...</p>';
  document.getElementById('errorMsg').style.display = 'none';
  allMembers = [];
  adminMembers = [];
  cachedProcurement = null;
  currentFilter = 'all';
  adminFilter = 'all';
}

