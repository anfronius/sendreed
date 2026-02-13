document.addEventListener('DOMContentLoaded', function() {
  var table = document.getElementById('contacts-table');
  if (!table) return;

  var csrfToken = document.querySelector('input[name="_csrf"]');
  if (!csrfToken) {
    // Try to find it from a meta tag or extract from the page
    var csrfEl = document.querySelector('[name="_csrf"]');
    csrfToken = csrfEl ? csrfEl.value : '';
  } else {
    csrfToken = csrfToken.value;
  }

  // Get CSRF token from cookie or hidden input
  function getCsrf() {
    var el = document.querySelector('input[name="_csrf"]');
    return el ? el.value : csrfToken;
  }

  // Make editable cells clickable
  table.addEventListener('click', function(e) {
    var span = e.target.closest('.editable');
    if (!span || span.querySelector('input')) return;

    var field = span.dataset.field;
    var id = span.dataset.id;
    var currentValue = span.textContent.trim();

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
      span.textContent = newValue;

      if (newValue === currentValue) return;

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
          span.classList.add('edit-success');
          setTimeout(function() { span.classList.remove('edit-success'); }, 1000);
        } else {
          span.textContent = currentValue;
          span.classList.add('edit-error');
          setTimeout(function() { span.classList.remove('edit-error'); }, 1000);
        }
      })
      .catch(function() {
        span.textContent = currentValue;
        span.classList.add('edit-error');
        setTimeout(function() { span.classList.remove('edit-error'); }, 1000);
      });
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        span.textContent = currentValue;
      }
    });
  });

  // Delete contact buttons
  table.addEventListener('click', function(e) {
    var btn = e.target.closest('.delete-contact');
    if (!btn) return;

    if (!confirm('Delete this contact?')) return;

    var id = btn.dataset.id;
    var row = btn.closest('tr');

    fetch('/api/contacts/' + id, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': getCsrf() },
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        row.remove();
      }
    });
  });
});
