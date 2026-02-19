document.addEventListener('DOMContentLoaded', function() {
  var wizard = document.getElementById('campaign-wizard');
  if (!wizard) return;

  var state = {
    step: 1,
    channel: null,
    templateId: null,
    templateSubject: null,
    templateBody: null,
    contactIds: [],
    contacts: [],
    editingTemplateId: null, // Track if editing an existing template
  };

  var steps = wizard.querySelectorAll('.wizard-step');
  var panels = wizard.querySelectorAll('.wizard-panel');

  function showStep(n) {
    state.step = n;
    steps.forEach(function(s) {
      s.classList.toggle('active', parseInt(s.dataset.step) <= n);
    });
    panels.forEach(function(p) {
      p.classList.toggle('active', p.id === 'step-' + n);
    });
  }

  // Back buttons
  wizard.querySelectorAll('.wizard-back').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (state.step > 1) showStep(state.step - 1);
    });
  });

  // Step 1: Channel selection
  wizard.querySelectorAll('.channel-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.channel = this.dataset.channel;
      wizard.querySelectorAll('.channel-btn').forEach(function(b) { b.classList.remove('selected'); });
      this.classList.add('selected');

      // Show/hide subject field for email
      var subjectGroup = document.getElementById('subject-group');
      if (subjectGroup) {
        subjectGroup.style.display = state.channel === 'email' ? 'block' : 'none';
      }

      loadTemplates();
      showStep(2);
    });
  });

  // Step 2: Template selection
  function loadTemplates() {
    var container = document.getElementById('templates-list');
    container.innerHTML = '<p class="loading">Loading templates...</p>';

    fetch('/api/templates?channel=' + state.channel, {
      headers: { 'X-CSRF-Token': window.CSRF_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.templates || data.templates.length === 0) {
        container.innerHTML = '<p>No templates yet. Create one below.</p>';
        return;
      }
      var html = '';
      data.templates.forEach(function(t) {
        html += '<div class="template-option" data-id="' + t.id + '" data-subject="' + escapeAttr(t.subject_template || '') + '" data-body="' + escapeAttr(t.body_template) + '" data-name="' + escapeAttr(t.name) + '">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<strong>' + escapeHtml(t.name) + '</strong>';
        html += '<button type="button" class="btn btn-sm btn-secondary edit-template-btn" data-id="' + t.id + '">Edit</button>';
        html += '</div>';
        if (t.subject_template) html += '<small>Subject: ' + escapeHtml(t.subject_template) + '</small><br>';
        html += '<small>' + escapeHtml(t.body_template.substring(0, 100)) + (t.body_template.length > 100 ? '...' : '') + '</small>';
        html += '</div>';
      });
      container.innerHTML = html;

      // Select template
      container.querySelectorAll('.template-option').forEach(function(opt) {
        opt.addEventListener('click', function(e) {
          // Don't select if clicking the edit button
          if (e.target.closest('.edit-template-btn')) return;
          container.querySelectorAll('.template-option').forEach(function(o) { o.classList.remove('selected'); });
          this.classList.add('selected');
          state.templateId = parseInt(this.dataset.id);
          state.templateSubject = this.dataset.subject;
          state.templateBody = this.dataset.body;
          document.getElementById('step2-next').disabled = false;
        });
      });

      // Edit template buttons
      container.querySelectorAll('.edit-template-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var opt = this.closest('.template-option');
          state.editingTemplateId = parseInt(opt.dataset.id);
          document.getElementById('tmpl-name').value = opt.dataset.name;
          document.getElementById('tmpl-subject').value = opt.dataset.subject || '';
          document.getElementById('tmpl-body').value = opt.dataset.body;
          document.getElementById('save-template-btn').textContent = 'Update Template';
          document.getElementById('new-template-form').scrollIntoView({ behavior: 'smooth' });
        });
      });
    });
  }

  // Save/update template
  document.getElementById('save-template-btn').addEventListener('click', function() {
    var name = document.getElementById('tmpl-name').value.trim();
    var subject = document.getElementById('tmpl-subject').value.trim();
    var body = document.getElementById('tmpl-body').value.trim();

    if (!name || !body) {
      alert('Template name and body are required.');
      return;
    }

    var payload = {
      name: name,
      channel: state.channel,
      body_template: body,
    };
    if (state.channel === 'email') {
      payload.subject_template = subject || '';
    }

    var url, method;
    if (state.editingTemplateId) {
      url = '/api/templates/' + state.editingTemplateId;
      method = 'PUT';
    } else {
      url = '/api/templates';
      method = 'POST';
    }

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.CSRF_TOKEN },
      body: JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) {
        alert(data.error);
        return;
      }
      var savedId = state.editingTemplateId || data.id;
      state.templateId = savedId;
      state.templateSubject = payload.subject_template || '';
      state.templateBody = payload.body_template;
      document.getElementById('step2-next').disabled = false;

      // Reset form
      document.getElementById('tmpl-name').value = '';
      document.getElementById('tmpl-subject').value = '';
      document.getElementById('tmpl-body').value = '';
      state.editingTemplateId = null;
      document.getElementById('save-template-btn').textContent = 'Save Template';
      loadTemplates();
    });
  });

  // Step 2 next
  document.getElementById('step2-next').addEventListener('click', function() {
    if (!state.templateId) return;
    loadContacts();
    showStep(3);
  });

  // Variable toolbar
  document.getElementById('variable-toolbar').addEventListener('click', function(e) {
    if (e.target.classList.contains('var-btn')) {
      var textarea = document.getElementById('tmpl-body');
      var varText = '{{' + e.target.dataset.var + '}}';
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + varText + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + varText.length;
      textarea.focus();
    }
  });

  // Step 3: Contact selection
  function loadContacts() {
    var container = document.getElementById('contacts-list');
    container.innerHTML = '<p class="loading">Loading contacts...</p>';

    fetch('/api/contacts?channel=' + state.channel, {
      headers: { 'X-CSRF-Token': window.CSRF_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      state.contacts = data.contacts || [];
      renderContacts(state.contacts);
    });
  }

  function renderContacts(contacts) {
    var container = document.getElementById('contacts-list');
    if (contacts.length === 0) {
      container.innerHTML = '<p>No eligible contacts found for this channel. <a href="/contacts/import">Import contacts</a> first.</p>';
      return;
    }

    var html = '';
    contacts.forEach(function(c) {
      var name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
      var detail = state.channel === 'email' ? c.email : c.phone;
      var checked = state.contactIds.indexOf(c.id) !== -1 ? 'checked' : '';
      html += '<label class="contact-check">';
      html += '<input type="checkbox" value="' + c.id + '" ' + checked + '>';
      html += '<span class="contact-name">' + escapeHtml(name) + '</span>';
      html += '<span class="contact-detail">' + escapeHtml(detail || '') + '</span>';
      html += '</label>';
    });
    container.innerHTML = html;

    container.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
      cb.addEventListener('change', updateSelectedCount);
    });
  }

  function updateSelectedCount() {
    var checked = document.querySelectorAll('#contacts-list input[type=checkbox]:checked');
    state.contactIds = Array.from(checked).map(function(cb) { return parseInt(cb.value); });
    document.getElementById('selected-count').textContent = state.contactIds.length + ' selected';
    document.getElementById('step3-next').disabled = state.contactIds.length === 0;
  }

  // Select all
  document.getElementById('select-all-btn').addEventListener('click', function() {
    document.querySelectorAll('#contacts-list input[type=checkbox]').forEach(function(cb) {
      cb.checked = true;
    });
    updateSelectedCount();
  });

  // Contact search
  document.getElementById('contact-search').addEventListener('input', function() {
    var q = this.value.toLowerCase();
    var filtered = state.contacts.filter(function(c) {
      var name = ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase();
      var detail = (c.email || '') + ' ' + (c.phone || '');
      return name.indexOf(q) !== -1 || detail.toLowerCase().indexOf(q) !== -1;
    });
    renderContacts(filtered);
  });

  // Step 3 next → preview
  document.getElementById('step3-next').addEventListener('click', function() {
    if (state.contactIds.length === 0) return;
    renderPreview();
    showStep(4);
  });

  // Step 4: Preview
  function renderPreview() {
    var container = document.getElementById('preview-list');
    var html = '';
    var selectedContacts = state.contacts.filter(function(c) {
      return state.contactIds.indexOf(c.id) !== -1;
    });

    selectedContacts.forEach(function(c) {
      var name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
      var subject = state.templateSubject ? renderTemplate(state.templateSubject, c) : '';
      var body = renderTemplate(state.templateBody, c);

      html += '<div class="preview-card">';
      html += '<div class="preview-header"><strong>' + escapeHtml(name) + '</strong></div>';
      if (state.channel === 'email' && subject) {
        html += '<div class="preview-subject">Subject: ' + escapeHtml(subject) + '</div>';
      }
      html += '<div class="preview-body">' + escapeHtml(body) + '</div>';
      html += '</div>';
    });

    container.innerHTML = html;

    // Update form
    document.getElementById('form-channel').value = state.channel;
    document.getElementById('form-template-id').value = state.templateId;
    document.getElementById('form-contact-ids').value = state.contactIds.join(',');
    document.getElementById('campaign-form').action = '/campaign/create';
    document.getElementById('send-btn').textContent = state.channel === 'email' ? 'Create & Send Emails' : 'Create & Generate Texts';
  }

  function renderTemplate(templateStr, contact) {
    if (!templateStr) return '';
    return templateStr.replace(/\{\{(\w+)\}\}/g, function(match, varName) {
      if (varName === 'years' && contact.purchase_date) {
        var year = new Date(contact.purchase_date).getFullYear();
        var now = new Date().getFullYear();
        return (now - year) > 0 ? String(now - year) : '';
      }
      return contact[varName] != null ? String(contact[varName]) : '';
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
