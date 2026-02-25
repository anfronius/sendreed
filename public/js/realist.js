document.addEventListener('DOMContentLoaded', function() {
  var table = document.getElementById('lookup-table');
  if (!table) return;

  function getCsrf() {
    var el = document.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  // ---- Checkbox selection + bulk actions ----
  var selectAll = document.getElementById('select-all-lookup');
  var bulkNotFoundBtn = document.getElementById('bulk-not-found-btn');
  var bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  var bulkNfCount = document.getElementById('bulk-nf-count');
  var bulkDelCount = document.getElementById('bulk-del-count');

  function getCheckedIds() {
    var checked = table.querySelectorAll('.lookup-checkbox:checked');
    return Array.from(checked).map(function(cb) { return parseInt(cb.value); });
  }

  function updateBulkState() {
    var ids = getCheckedIds();
    var count = ids.length;
    if (bulkNotFoundBtn) {
      bulkNotFoundBtn.style.display = count > 0 ? 'inline-block' : 'none';
      bulkNfCount.textContent = count;
    }
    if (bulkDeleteBtn) {
      bulkDeleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
      bulkDelCount.textContent = count;
    }
  }

  if (selectAll) {
    selectAll.addEventListener('change', function() {
      table.querySelectorAll('.lookup-checkbox').forEach(function(cb) { cb.checked = selectAll.checked; });
      updateBulkState();
    });
  }

  table.addEventListener('change', function(e) {
    if (e.target.classList.contains('lookup-checkbox')) {
      updateBulkState();
      if (selectAll && !e.target.checked) selectAll.checked = false;
    }
  });

  if (bulkNotFoundBtn) {
    bulkNotFoundBtn.addEventListener('click', function() {
      var ids = getCheckedIds();
      if (ids.length === 0) return;
      if (!confirm('Mark ' + ids.length + ' property/properties as Not Found?')) return;

      fetch('/api/realist-lookup/bulk-not-found', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ ids: ids }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          ids.forEach(function(id) {
            var row = table.querySelector('tr[data-property-id="' + id + '"]');
            if (row) {
              var badge = row.querySelector('.badge');
              badge.textContent = 'not_found';
              badge.className = 'badge lookup-status-not_found';
              row.dataset.status = 'not_found';
              var nameInput = row.querySelector('.owner-name-input');
              nameInput.disabled = true;
              nameInput.value = '';
              var nfBtn = row.querySelector('.not-found-btn');
              if (nfBtn) nfBtn.remove();
              row.querySelector('.lookup-checkbox').checked = false;
            }
          });
          updateBulkState();
          if (selectAll) selectAll.checked = false;
          if (data.counts) updateProgress(data.counts);
        }
      });
    });
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', function() {
      var ids = getCheckedIds();
      if (ids.length === 0) return;
      if (!confirm('Delete ' + ids.length + ' property/properties? This cannot be undone.')) return;

      fetch('/api/realist-lookup/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ ids: ids }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          ids.forEach(function(id) {
            var row = table.querySelector('tr[data-property-id="' + id + '"]');
            if (row) row.remove();
          });
          updateBulkState();
          if (selectAll) selectAll.checked = false;
          if (data.counts) updateProgress(data.counts);
        }
      });
    });
  }

  // ---- Build full address string with city + state ----
  function buildFullAddress(row) {
    var address = (row.dataset.address || '').replace(/\s+/g, ' ').trim();
    var city = row.dataset.city || '';
    var state = row.dataset.state || 'CA';
    if (city) address += ', ' + city;
    address += ', ' + state;
    return address;
  }

  function copyToClipboard(text, callback) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(callback).catch(function() {
        fallbackCopy(text);
        callback();
      });
    } else {
      fallbackCopy(text);
      callback();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // ---- Copy Address to Clipboard ----
  table.addEventListener('click', function(e) {
    var btn = e.target.closest('.copy-address-btn');
    if (!btn) return;

    var row = btn.closest('tr');
    var fullAddress = buildFullAddress(row);
    copyToClipboard(fullAddress, function() {
      var original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copy-success');
      setTimeout(function() {
        btn.textContent = original;
        btn.classList.remove('copy-success');
      }, 1500);
    });
  });

  // ---- Auto-save Owner Name on Blur / Enter ----
  function setupNameInputs() {
    var nameInputs = table.querySelectorAll('.owner-name-input:not([data-bound])');
    nameInputs.forEach(function(input) {
      input.setAttribute('data-bound', '1');
      input.dataset.originalValue = input.value;

      function saveOwnerName() {
        var newValue = input.value.trim();
        var originalValue = input.dataset.originalValue;
        if (newValue === originalValue || !newValue) return;

        var id = input.dataset.id;
        fetch('/api/realist-lookup/' + id, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrf(),
          },
          body: JSON.stringify({ owner_name: newValue }),
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.success) {
            input.dataset.originalValue = newValue;
            input.style.borderColor = '#22c55e';
            setTimeout(function() { input.style.borderColor = ''; }, 1000);
            // Update row status badge
            var row = input.closest('tr');
            var badge = row.querySelector('.badge');
            badge.textContent = 'found';
            badge.className = 'badge lookup-status-found';
            row.dataset.status = 'found';
            updateProgress(data.counts);
          } else {
            input.style.borderColor = '#dc2626';
            setTimeout(function() { input.style.borderColor = ''; }, 1000);
          }
        })
        .catch(function() {
          input.style.borderColor = '#dc2626';
          setTimeout(function() { input.style.borderColor = ''; }, 1000);
        });
      }

      input.addEventListener('blur', saveOwnerName);
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    });
  }

  setupNameInputs();

  // ---- Not Found Button ----
  table.addEventListener('click', function(e) {
    var btn = e.target.closest('.not-found-btn');
    if (!btn) return;

    var id = btn.dataset.id;
    fetch('/api/realist-lookup/' + id + '/not-found', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrf(),
      },
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        var row = btn.closest('tr');
        var badge = row.querySelector('.badge');
        badge.textContent = 'not_found';
        badge.className = 'badge lookup-status-not_found';
        row.dataset.status = 'not_found';
        var nameInput = row.querySelector('.owner-name-input');
        nameInput.disabled = true;
        nameInput.value = '';
        btn.remove();
        updateProgress(data.counts);
      }
    });
  });

  // ---- Custom Tab Key Behavior ----
  table.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab' || e.shiftKey) return;

    var input = e.target.closest('.owner-name-input');
    if (!input) return;

    e.preventDefault();
    input.blur();

    var allInputs = Array.from(table.querySelectorAll('.owner-name-input:not(:disabled)'));
    var currentIndex = allInputs.indexOf(input);
    var nextInput = allInputs[currentIndex + 1];

    if (nextInput) {
      var nextRow = nextInput.closest('tr');
      var fullAddr = buildFullAddress(nextRow);
      copyToClipboard(fullAddr, function() {
        var copyBtn = nextRow.querySelector('.copy-address-btn');
        if (copyBtn) {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copy-success');
          setTimeout(function() {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copy-success');
          }, 1500);
        }
      });

      setTimeout(function() {
        nextInput.focus();
        nextInput.select();
      }, 50);
    }
  });

  // ---- Update Progress Bar ----
  function updateProgress(counts) {
    if (!counts) return;
    var total = counts.total || 1;
    var completed = (counts.found || 0) + (counts.not_found || 0);
    var pct = Math.round((completed / total) * 100);

    var bar = document.getElementById('lookup-progress');
    if (bar) bar.style.width = pct + '%';

    var foundEl = document.getElementById('count-found');
    var pendingEl = document.getElementById('count-pending');
    var notFoundEl = document.getElementById('count-not-found');
    if (foundEl) foundEl.textContent = counts.found;
    if (pendingEl) pendingEl.textContent = counts.pending;
    if (notFoundEl) notFoundEl.textContent = counts.not_found;
  }

  // ---- City Mappings Panel (admin only) ----
  var cityPanelBtn = document.getElementById('btn-city-mappings');
  if (cityPanelBtn) {
    var cityPanel = document.getElementById('city-mappings-panel');
    var cityList = document.getElementById('city-mappings-list');

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str || ''));
      return div.innerHTML;
    }

    function escapeAttr(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    cityPanelBtn.addEventListener('click', function() {
      cityPanel.style.display = 'flex';
      loadUnmappedCities();
    });

    document.getElementById('btn-close-city-panel').addEventListener('click', function() {
      cityPanel.style.display = 'none';
    });

    function loadUnmappedCities() {
      cityList.innerHTML = '<p>Loading\u2026</p>';
      fetch('/api/city-mappings/unmapped', {
        headers: { 'X-CSRF-Token': getCsrf() }
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.unmapped || data.unmapped.length === 0) {
          cityList.innerHTML = '<p class="text-muted">All cities are mapped.</p>';
          return;
        }
        var html = '<table class="data-table"><thead><tr>' +
          '<th>Raw City Value</th><th>Sample Address</th><th>Correct City Name</th><th></th>' +
          '</tr></thead><tbody>';
        data.unmapped.forEach(function(row) {
          html += '<tr data-raw="' + escapeAttr(row.raw_city) + '">' +
            '<td><code>' + escapeHtml(row.raw_city) + '</code> <small>(' + row.count + ' records)</small></td>' +
            '<td>' + escapeHtml(row.sample_address) +
              ' <button class="btn-sm copy-addr" data-addr="' + escapeAttr(row.sample_address) + '">Copy</button></td>' +
            '<td><input class="city-input" type="text" placeholder="Enter correct city name" style="width:200px"></td>' +
            '<td><button class="btn-sm btn-primary save-mapping">Save</button></td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        cityList.innerHTML = html;
      });
    }

    cityList.addEventListener('click', function(e) {
      // Copy sample address
      if (e.target.classList.contains('copy-addr')) {
        var addr = e.target.getAttribute('data-addr');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(addr);
        } else {
          var ta = document.createElement('textarea');
          ta.value = addr;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        e.target.textContent = 'Copied!';
        setTimeout(function() { e.target.textContent = 'Copy'; }, 1500);
      }
      // Save mapping
      if (e.target.classList.contains('save-mapping')) {
        var row = e.target.closest('tr');
        var rawCity = row.getAttribute('data-raw');
        var mappedCity = row.querySelector('.city-input').value.trim();
        if (!mappedCity) { alert('Please enter the correct city name.'); return; }
        e.target.disabled = true;
        e.target.textContent = 'Saving\u2026';
        fetch('/api/city-mappings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrf()
          },
          body: JSON.stringify({ raw_city: rawCity, mapped_city: mappedCity })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.success) {
            row.remove();
            // Update badge count
            var badge = cityPanelBtn.querySelector('.badge-count');
            var remaining = cityList.querySelectorAll('tbody tr').length;
            if (badge) {
              if (remaining === 0) badge.remove();
              else badge.textContent = remaining;
            }
            if (remaining === 0) {
              cityList.innerHTML = '<p class="text-muted">All cities are mapped.</p>';
            }
          } else {
            e.target.disabled = false;
            e.target.textContent = 'Save';
            alert('Error: ' + (data.error || 'Save failed.'));
          }
        });
      }
    });

    // Allow Enter key to save from city-input field
    cityList.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.target.classList.contains('city-input')) {
        e.preventDefault();
        var saveBtn = e.target.closest('tr').querySelector('.save-mapping');
        if (saveBtn && !saveBtn.disabled) saveBtn.click();
      }
    });
  }
});
