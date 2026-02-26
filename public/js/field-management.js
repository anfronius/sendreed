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
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.success) {
      alert('Failed to update field: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(function(err) {
    alert('Error updating field: ' + err.message);
  });
}
