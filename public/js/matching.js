document.addEventListener('DOMContentLoaded', function() {
  function getCsrf() {
    return window.CSRF_TOKEN || (document.querySelector('input[name="_csrf"]') || {}).value || '';
  }

  // ---- Apply All Confirmed (AJAX) ----
  var applyBtn = document.getElementById('apply-all-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      if (!confirm('Apply all confirmed matches to your contacts?')) return;

      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying...';

      fetch('/realestate/matching/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrf(),
        },
        body: JSON.stringify({}),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          var confirmedSection = document.getElementById('section-confirmed');
          if (confirmedSection) {
            confirmedSection.querySelectorAll('.match-card').forEach(function(card) {
              card.classList.add('match-card-applied');
              var actions = card.querySelector('.match-card-actions');
              if (actions) {
                var badge = actions.querySelector('.confidence-badge');
                actions.innerHTML = '';
                if (badge) actions.appendChild(badge);
                var appliedBadge = document.createElement('span');
                appliedBadge.className = 'badge badge-status-sent';
                appliedBadge.textContent = 'Applied';
                actions.appendChild(appliedBadge);
              }
            });
          }
          applyBtn.textContent = 'Applied (' + data.applied + ')';
          applyBtn.classList.remove('btn-primary');
          applyBtn.classList.add('btn-secondary');
        } else {
          alert('Failed to apply: ' + (data.error || 'Unknown error'));
          applyBtn.disabled = false;
          applyBtn.textContent = 'Apply All Confirmed (' + applyBtn.dataset.count + ')';
        }
      })
      .catch(function(err) {
        alert('Error: ' + err.message);
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply All Confirmed (' + applyBtn.dataset.count + ')';
      });
    });
  }

  // ---- Confirm Match ----
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.confirm-match-btn');
    if (!btn) return;

    var matchId = btn.dataset.matchId;
    var card = btn.closest('.match-card');

    btn.disabled = true;
    btn.textContent = '...';

    fetch('/api/match/' + matchId + '/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrf(),
      },
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        card.classList.add('match-card-confirmed');
        var actions = card.querySelector('.match-card-actions');
        var badge = actions.querySelector('.confidence-badge');
        actions.innerHTML = '';
        if (badge) actions.appendChild(badge);
        var confirmedBadge = document.createElement('span');
        confirmedBadge.className = 'badge badge-status-sent';
        confirmedBadge.textContent = 'Confirmed';
        actions.appendChild(confirmedBadge);
        var arrow = card.querySelector('.match-card-arrow');
        if (arrow) arrow.textContent = '←';
      } else {
        btn.disabled = false;
        btn.textContent = 'Confirm';
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = 'Confirm';
    });
  });

  // ---- Skip/Remove Match ----
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.skip-match-btn');
    if (!btn) return;

    var matchId = btn.dataset.matchId;
    var card = btn.closest('.match-card');

    btn.disabled = true;

    fetch('/api/match/' + matchId + '/skip', {
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
      }
    })
    .catch(function() {
      btn.disabled = false;
    });
  });

  // ---- vCard Import Search for Unmatched Contacts ----
  var searchTimeout = null;

  document.addEventListener('input', function(e) {
    var input = e.target.closest('.contact-search-input');
    if (!input) return;

    var query = input.value.trim();
    var contactId = input.dataset.contactId;
    var resultsDiv = document.querySelector('.contact-search-results[data-contact-id="' + contactId + '"]');

    if (searchTimeout) clearTimeout(searchTimeout);

    if (query.length < 2) {
      resultsDiv.innerHTML = '';
      return;
    }

    searchTimeout = setTimeout(function() {
      fetch('/api/imported-contacts?search=' + encodeURIComponent(query))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          resultsDiv.innerHTML = '';
          if (!data.contacts || data.contacts.length === 0) {
            resultsDiv.innerHTML = '<div class="search-no-results">No vCard imports found</div>';
            return;
          }
          data.contacts.forEach(function(c) {
            var item = document.createElement('div');
            item.className = 'search-result-item';
            item.dataset.importedContactId = c.id;
            item.dataset.contactId = contactId;
            var name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
            var detail = [c.phone, c.email].filter(Boolean).join(' | ');
            item.innerHTML = '<strong>' + escapeHtml(name) + '</strong>' +
              (detail ? ' <span class="search-result-detail">' + escapeHtml(detail) + '</span>' : '');
            resultsDiv.appendChild(item);
          });
        });
    }, 300);
  });

  // ---- Select Search Result (Manual Match) ----
  document.addEventListener('click', function(e) {
    var item = e.target.closest('.search-result-item');
    if (!item) return;

    var importedContactId = item.dataset.importedContactId;
    var contactId = item.dataset.contactId;
    var card = item.closest('.match-card');

    fetch('/api/match/' + contactId + '/manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrf(),
      },
      body: JSON.stringify({ imported_contact_id: importedContactId }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        card.classList.add('match-card-confirmed');
        var rightSide = card.querySelector('.match-card-right');
        rightSide.innerHTML = '<div class="match-imported-name">' + escapeHtml(item.querySelector('strong').textContent) + '</div>' +
          '<span class="badge badge-status-sent">Manually Matched</span>';
      }
    });
  });

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
