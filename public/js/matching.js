document.addEventListener('DOMContentLoaded', function() {
  function getCsrf() {
    return window.CSRF_TOKEN || (document.querySelector('input[name="_csrf"]') || {}).value || '';
  }

  // ---- Helper: update stat card numbers ----
  function updateStatCard(label, value) {
    var cards = document.querySelectorAll('.stat-card');
    for (var i = 0; i < cards.length; i++) {
      var lbl = cards[i].querySelector('.stat-label');
      if (lbl && lbl.textContent.trim() === label) {
        cards[i].querySelector('.stat-number').textContent = value;
        return;
      }
    }
  }

  // ---- Helper: update section count badge ----
  function updateSectionCount(section, delta) {
    if (!section) return;
    var badge = section.querySelector('h2 .count-badge');
    if (badge) {
      var count = Math.max(0, (parseInt(badge.textContent) || 0) + delta);
      badge.textContent = count;
      // Hide entire section if empty
      if (count === 0) {
        section.style.display = 'none';
      }
    }
  }

  // ---- Helper: update Apply All Confirmed button count ----
  function updateApplyButtonCount(delta) {
    var btn = document.getElementById('apply-all-btn');
    if (!btn) return;
    var count = parseInt(btn.dataset.count || '0') + delta;
    btn.dataset.count = count;
    btn.textContent = 'Apply All Confirmed (' + count + ')';
    if (count > 0) { btn.classList.remove('hidden'); } else { btn.classList.add('hidden'); }
  }

  // ---- Helper: fade out and remove a card ----
  function fadeOutCard(card, callback) {
    card.style.transition = 'opacity 0.3s, max-height 0.3s';
    card.style.opacity = '0';
    card.style.overflow = 'hidden';
    setTimeout(function() {
      card.style.maxHeight = '0';
      card.style.margin = '0';
      card.style.padding = '0';
      setTimeout(function() {
        card.remove();
        if (callback) callback();
      }, 300);
    }, 300);
  }

  // ---- Apply All Confirmed (AJAX) — Realist Finalize pattern ----
  var applyBtn = document.getElementById('apply-all-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      var count = parseInt(applyBtn.dataset.count || '0');
      if (!confirm('Apply all ' + count + ' confirmed match(es) to your contacts?')) return;

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
          // Remove ALL confirmed/auto-confirmed cards from ALL sections
          var allConfirmedCards = document.querySelectorAll('.match-card-confirmed, .match-card-applied, #section-confirmed .match-card');
          allConfirmedCards.forEach(function(card) {
            card.remove();
          });

          // Hide auto-confirmed section entirely
          var confirmedSection = document.getElementById('section-confirmed');
          if (confirmedSection) confirmedSection.style.display = 'none';

          // Hide applied section entirely
          var appliedSections = document.querySelectorAll('.match-section-green');
          appliedSections.forEach(function(sec) { sec.style.display = 'none'; });

          // Update stats
          updateStatCard('Matched', 0);

          // Hide the button
          applyBtn.dataset.count = '0';
          applyBtn.classList.add('hidden');

          // Browser alert like Realist Finalize
          var msg = 'Applied ' + data.applied + ' match(es).';
          if (data.phonesUpdated) msg += ' Updated ' + data.phonesUpdated + ' phone(s).';
          if (data.emailsUpdated) msg += ' Updated ' + data.emailsUpdated + ' email(s).';
          alert(msg);
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

  // ---- Confirm Match — fade out from review, update counts dynamically ----
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.confirm-match-btn');
    if (!btn) return;

    var matchId = btn.dataset.matchId;
    var card = btn.closest('.match-card');
    var reviewSection = card.closest('#section-review');

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
        // Mark as confirmed and fade out — no need to stare at it
        card.classList.add('match-card-confirmed');

        // Update review section count
        updateSectionCount(reviewSection, -1);

        // Update matched stat
        var matchedStat = document.querySelector('.stat-card .text-success');
        if (matchedStat) {
          matchedStat.textContent = (parseInt(matchedStat.textContent) || 0) + 1;
        }

        // Update review stat
        var reviewCards = document.querySelectorAll('.stat-card');
        for (var i = 0; i < reviewCards.length; i++) {
          var lbl = reviewCards[i].querySelector('.stat-label');
          if (lbl && lbl.textContent.trim() === 'Needs Review') {
            var num = reviewCards[i].querySelector('.stat-number');
            num.textContent = Math.max(0, (parseInt(num.textContent) || 0) - 1);
            break;
          }
        }

        // Update Apply All Confirmed button count
        updateApplyButtonCount(1);

        // Fade out the card from view
        fadeOutCard(card);
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
    var wasInReview = card.closest('#section-review') !== null;

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
        var wasConfirmed = card.classList.contains('match-card-confirmed') || card.closest('#section-confirmed');
        var parentSection = card.closest('.match-section');

        // If card was confirmed/auto-confirmed, decrement Apply button count
        if (wasConfirmed) {
          updateApplyButtonCount(-1);
          updateStatCard('Matched', Math.max(0, (parseInt(document.querySelector('.stat-card .text-success').textContent) || 0) - 1));
        }

        // If skipped from "Needs Review", update stats and move to unmatched
        if (wasInReview) {
          // Update review stat
          var reviewCards = document.querySelectorAll('.stat-card');
          for (var ri = 0; ri < reviewCards.length; ri++) {
            var rlbl = reviewCards[ri].querySelector('.stat-label');
            if (rlbl && rlbl.textContent.trim() === 'Needs Review') {
              var rnum = reviewCards[ri].querySelector('.stat-number');
              rnum.textContent = Math.max(0, (parseInt(rnum.textContent) || 0) - 1);
              break;
            }
          }
        }

        // If skipped from "Needs Review", move to "No Match Found" section
        if (wasInReview && data.contact) {
          // Update No Match stat
          var noMatchStat = document.querySelector('.stat-card .text-danger');
          if (noMatchStat) {
            noMatchStat.textContent = (parseInt(noMatchStat.textContent) || 0) + 1;
          }

          var unmatchedSection = document.getElementById('section-unmatched');
          if (unmatchedSection) {
            unmatchedSection.style.display = '';
            var unmatchedList = unmatchedSection.querySelector('.match-list');
            if (unmatchedList) {
              var newCard = document.createElement('div');
              newCard.className = 'match-card';
              newCard.dataset.contactId = data.contact.id;

              var contactName = [data.contact.first_name, data.contact.last_name].filter(Boolean).join(' ');
              var contactDetail = '';
              if (data.contact.phone) contactDetail += 'Phone: ' + escapeHtml(data.contact.phone) + ' ';
              else contactDetail += '<em>No phone</em> ';
              if (data.contact.email) contactDetail += 'Email: ' + escapeHtml(data.contact.email);
              else contactDetail += '<em>No email</em>';

              newCard.innerHTML =
                '<div class="match-card-left">' +
                  '<div class="match-contact-name">' + escapeHtml(contactName) + '</div>' +
                  (data.contact.property_address ? '<div class="match-contact-detail">' + escapeHtml(data.contact.property_address) + '</div>' : '') +
                  '<div class="match-contact-detail">' + contactDetail + '</div>' +
                '</div>' +
                '<div class="match-card-right" style="flex:1;">' +
                  '<div class="manual-match-form">' +
                    '<input type="text" class="contact-search-input" placeholder="Search vCard imports by name..." data-contact-id="' + data.contact.id + '">' +
                    '<div class="contact-search-results" data-contact-id="' + data.contact.id + '"></div>' +
                  '</div>' +
                '</div>';

              unmatchedList.appendChild(newCard);
              updateSectionCount(unmatchedSection, 1);
            }
          }
        }

        // Update the parent section count and fade out the card
        updateSectionCount(parentSection, -1);
        fadeOutCard(card);
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
    var unmatchedSection = card.closest('#section-unmatched');

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

        // Update unmatched section count
        updateSectionCount(unmatchedSection, -1);

        // Update matched stat
        var matchedStat = document.querySelector('.stat-card .text-success');
        if (matchedStat) {
          matchedStat.textContent = (parseInt(matchedStat.textContent) || 0) + 1;
        }

        // Update No Match stat
        updateStatCard('No Match', Math.max(0, (parseInt(document.querySelector('.stat-card .text-danger').textContent) || 0) - 1));

        // Update Apply All Confirmed button count
        updateApplyButtonCount(1);

        // Fade out card from view
        fadeOutCard(card);
      }
    });
  });

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
