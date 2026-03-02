document.addEventListener('DOMContentLoaded', function() {
  var fieldLists = document.querySelectorAll('.field-list');
  if (!fieldLists.length) return;
});

function toggleField(role, fieldName, visible) {
  fetch('/api/field-visibility', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.CSRF_TOKEN,
    },
    body: JSON.stringify({ role: role, field_name: fieldName, visible: visible }),
  })
  .then(function(r) {
    if (!r.ok) return r.json().catch(function() { return { error: 'Request failed (status ' + r.status + ')' }; });
    return r.json();
  })
  .then(function(data) {
    if (data.error) {
      alert('Failed to update field: ' + data.error);
    } else if (!data.success) {
      alert('Failed to update field: Unknown error');
    }
  })
  .catch(function(err) {
    alert('Error updating field: ' + err.message);
  });
}
