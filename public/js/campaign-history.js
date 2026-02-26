document.addEventListener('DOMContentLoaded', function() {
  var modal = document.getElementById('template-edit-modal');
  if (!modal) return;

  var editId = document.getElementById('template-edit-id');
  var editName = document.getElementById('template-edit-name');
  var editChannel = document.getElementById('template-edit-channel');
  var editSubject = document.getElementById('template-edit-subject');
  var editBody = document.getElementById('template-edit-body');
  var editScheduled = document.getElementById('template-edit-scheduled');
  var subjectGroup = document.getElementById('template-edit-subject-group');
  var saveBtn = document.getElementById('template-save-btn');
  var cancelBtn = document.getElementById('template-cancel-btn');
  var modalTitle = document.getElementById('template-modal-title');

  function openModal(data) {
    editId.value = data.id || '';
    editName.value = data.name || '';
    editChannel.value = data.channel || 'email';
    editSubject.value = data.subject || '';
    editBody.value = data.body || '';
    editScheduled.value = data.scheduled || '';
    subjectGroup.style.display = data.channel === 'sms' ? 'none' : 'block';
    modalTitle.textContent = data.id ? 'Edit Template' : 'New Template';
    modal.style.display = 'flex';
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeModal();
  });

  // Edit button click
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.edit-template-btn');
    if (!btn) return;
    openModal({
      id: btn.dataset.id,
      name: btn.dataset.name,
      channel: btn.dataset.channel,
      subject: btn.dataset.subject,
      body: btn.dataset.body,
      scheduled: btn.dataset.scheduled,
    });
  });

  // Delete button click
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.delete-template-btn');
    if (!btn) return;
    if (!confirm('Delete template "' + btn.dataset.name + '"?')) return;

    fetch('/api/templates/' + btn.dataset.id, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': window.CSRF_TOKEN },
    })
    .then(function(r) {
      if (!r.ok) return r.json().catch(function() { return { error: 'Request failed (status ' + r.status + ')' }; });
      return r.json();
    })
    .then(function(data) {
      if (data.error) {
        alert('Failed to delete: ' + data.error);
      } else if (data.success) {
        var row = btn.closest('tr');
        if (row) row.remove();
      } else {
        alert('Failed to delete: Unknown error');
      }
    })
    .catch(function(err) {
      alert('Error: ' + err.message);
    });
  });

  // Save button click
  saveBtn.addEventListener('click', function() {
    var id = editId.value;
    var payload = {
      name: editName.value,
      subject_template: editSubject.value,
      body_template: editBody.value,
      scheduled_date: editScheduled.value || null,
    };

    if (!payload.name || !payload.body_template) {
      alert('Name and body are required.');
      return;
    }

    var url = '/api/templates/' + id;
    var method = 'PUT';

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': window.CSRF_TOKEN,
      },
      body: JSON.stringify(payload),
    })
    .then(function(r) {
      if (!r.ok) return r.json().catch(function() { return { error: 'Request failed (status ' + r.status + ')' }; });
      return r.json();
    })
    .then(function(data) {
      if (data.error) {
        alert('Failed to save: ' + data.error);
      } else if (data.success || data.id) {
        closeModal();
        window.location.reload();
      } else {
        alert('Failed to save: Unknown error');
      }
    })
    .catch(function(err) {
      alert('Error: ' + err.message);
    })
    .finally(function() {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    });
  });
});
