function updateDigestSetting(userId, enabled, days) {
  fetch('/api/digest-settings/' + userId, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.CSRF_TOKEN,
    },
    body: JSON.stringify({ enabled: enabled, lookahead_days: parseInt(days) || 7 }),
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.success) {
      alert('Failed to update digest setting: ' + (data.error || 'Unknown error'));
    } else {
      // Update toggle label for RE user's own toggle
      var toggle = document.getElementById('my-digest-toggle');
      if (toggle) {
        var label = toggle.parentElement.querySelector('span');
        if (label) label.textContent = enabled ? 'Enabled' : 'Disabled';
      }
    }
  })
  .catch(function(err) {
    alert('Error: ' + err.message);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  function getCsrf() {
    var el = document.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  }

  // Skip anniversary
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.skip-anniversary-btn');
    if (!btn) return;

    var id = btn.dataset.id;
    var card = btn.closest('.anniversary-card');

    btn.disabled = true;
    btn.textContent = '...';

    fetch('/api/anniversary/' + id + '/skip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrf(),
      },
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        card.style.transition = 'opacity 0.3s';
        card.style.opacity = '0';
        setTimeout(function() { card.remove(); }, 300);
      } else {
        btn.disabled = false;
        btn.textContent = 'Skip';
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = 'Skip';
    });
  });

  // Mark as sent
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.sent-anniversary-btn');
    if (!btn) return;

    var id = btn.dataset.id;
    var card = btn.closest('.anniversary-card');

    fetch('/api/anniversary/' + id + '/sent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrf(),
      },
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        card.style.transition = 'opacity 0.3s';
        card.style.opacity = '0';
        setTimeout(function() { card.remove(); }, 300);
      }
    });
  });
});
