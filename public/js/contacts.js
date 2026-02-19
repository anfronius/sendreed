document.addEventListener('DOMContentLoaded', function() {
  var table = document.getElementById('contacts-table');
  if (!table) return;

  function getCsrf() {
    var el = document.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  // ---- Checkbox selection + bulk delete ----
  var selectAll = document.getElementById('select-all-contacts');
  var bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  var bulkCount = document.getElementById('bulk-count');

  function updateBulkState() {
    var checked = table.querySelectorAll('.contact-checkbox:checked');
    var count = checked.length;
    if (bulkDeleteBtn) {
      bulkDeleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (bulkCount) {
      bulkCount.textContent = count;
    }
  }

  if (selectAll) {
    selectAll.addEventListener('change', function() {
      var checkboxes = table.querySelectorAll('.contact-checkbox');
      checkboxes.forEach(function(cb) { cb.checked = selectAll.checked; });
      updateBulkState();
    });
  }

  table.addEventListener('change', function(e) {
    if (e.target.classList.contains('contact-checkbox')) {
      updateBulkState();
      // Uncheck "select all" if any individual is unchecked
      if (selectAll && !e.target.checked) {
        selectAll.checked = false;
      }
    }
  });

  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', function() {
      var checked = table.querySelectorAll('.contact-checkbox:checked');
      var ids = Array.from(checked).map(function(cb) { return parseInt(cb.value); });
      if (ids.length === 0) return;
      if (!confirm('Delete ' + ids.length + ' contact(s)?')) return;

      fetch('/api/contacts/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrf(),
        },
        body: JSON.stringify({ ids: ids }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          ids.forEach(function(id) {
            var row = table.querySelector('tr[data-contact-id="' + id + '"]');
            if (row) row.remove();
          });
          updateBulkState();
          if (selectAll) selectAll.checked = false;
        }
      });
    });
  }

  // ---- Inline editing ----
  table.addEventListener('click', function(e) {
    var span = e.target.closest('.editable');
    if (!span || span.querySelector('input')) return;

    var field = span.dataset.field;
    var id = span.dataset.id;
    var isEmpty = span.classList.contains('editable-empty');
    var currentValue = isEmpty ? '' : span.textContent.trim();

    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'inline-edit-input';

    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();

    function save() {
      var newValue = input.value.trim();

      if (newValue === currentValue) {
        // Restore display
        if (!newValue) {
          span.textContent = getPlaceholder(field);
          span.classList.add('editable-empty');
        } else {
          span.textContent = newValue;
          span.classList.remove('editable-empty');
        }
        return;
      }

      fetch('/api/contacts/' + id, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrf(),
        },
        body: JSON.stringify({ field: field, value: newValue }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          if (newValue) {
            span.textContent = newValue;
            span.classList.remove('editable-empty');
          } else {
            span.textContent = getPlaceholder(field);
            span.classList.add('editable-empty');
          }
          span.classList.add('edit-success');
          setTimeout(function() { span.classList.remove('edit-success'); }, 1000);
        } else {
          restoreOriginal();
        }
      })
      .catch(function() {
        restoreOriginal();
      });

      function restoreOriginal() {
        if (currentValue) {
          span.textContent = currentValue;
          span.classList.remove('editable-empty');
        } else {
          span.textContent = getPlaceholder(field);
          span.classList.add('editable-empty');
        }
        span.classList.add('edit-error');
        setTimeout(function() { span.classList.remove('edit-error'); }, 1000);
      }
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        if (currentValue) {
          span.textContent = currentValue;
          span.classList.remove('editable-empty');
        } else {
          span.textContent = getPlaceholder(field);
          span.classList.add('editable-empty');
        }
      }
    });
  });

  function getPlaceholder(field) {
    var labels = {
      email: 'Add email',
      phone: 'Add phone',
      organization: 'Add org',
      city: 'Add city',
      state: 'Add state',
      first_name: '',
      last_name: '',
    };
    return labels[field] || '';
  }
});
