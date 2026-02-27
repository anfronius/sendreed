document.addEventListener('DOMContentLoaded', function () {
  // Provider auto-fill
  var providerSelect = document.getElementById('smtp_provider');
  var hostInput = document.getElementById('smtp_host');
  var portInput = document.getElementById('smtp_port');

  var providers = {
    outlook_free: { host: 'smtp-mail.outlook.com', port: 587 },
    microsoft365: { host: 'smtp.office365.com', port: 587 },
    yahoo_free: { host: 'smtp.mail.yahoo.com', port: 465 },
    protonmail: { host: 'smtp.protonmail.ch', port: 587 }
  };

  if (providerSelect) {
    providerSelect.addEventListener('change', function () {
      var p = providers[this.value];
      if (p) {
        hostInput.value = p.host;
        portInput.value = p.port;
      }
    });
  }

  // Test connection
  var testBtn = document.getElementById('test-btn');
  var resultDiv = document.getElementById('test-result');

  if (testBtn) {
    testBtn.addEventListener('click', function () {
      var form = document.getElementById('smtp-form');
      var data = {
        smtp_provider: form.smtp_provider.value,
        smtp_host: form.smtp_host.value,
        smtp_port: form.smtp_port.value,
        smtp_email: form.smtp_email.value,
        smtp_password: form.smtp_password.value,
        user_id: window.location.pathname.split('/')[3]
      };

      var csrfToken = form.querySelector('input[name="_csrf"]').value;

      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      resultDiv.style.display = 'none';

      fetch('/api/smtp-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify(data)
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          resultDiv.style.display = 'block';
          if (result.success) {
            resultDiv.className = 'test-result success';
            resultDiv.textContent = 'Connection successful!';
          } else {
            resultDiv.className = 'test-result error';
            resultDiv.textContent = 'Connection failed: ' + result.error;
          }
        })
        .catch(function (err) {
          resultDiv.style.display = 'block';
          resultDiv.className = 'test-result error';
          resultDiv.textContent = 'Request failed: ' + err.message;
        })
        .finally(function () {
          testBtn.disabled = false;
          testBtn.textContent = 'Test Connection';
        });
    });
  }
});
