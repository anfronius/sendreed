document.addEventListener('DOMContentLoaded', function() {
  var alert = document.getElementById('onboarding-alert');
  if (!alert) return;

  var userId = alert.getAttribute('data-user-id');
  var storageKey = 'sendreed_onboarding_v1_' + userId;
  var modal = document.getElementById('onboarding-modal');
  var dismissed = localStorage.getItem(storageKey) === 'true';

  function setDismissed() {
    alert.classList.remove('onboarding-alert-active');
    alert.classList.add('onboarding-alert-dismissed');
    document.querySelector('.onboarding-alert-sub').textContent = 'Click to review the platform guide.';
  }

  if (dismissed) {
    setDismissed();
  } else {
    alert.classList.add('onboarding-alert-active');
  }

  alert.addEventListener('click', function() {
    if (modal) modal.classList.remove('hidden');
  });

  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  var closeBtn = document.getElementById('onboarding-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      if (modal) modal.classList.add('hidden');
    });
  }

  var dismissBtn = document.getElementById('onboarding-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', function() {
      localStorage.setItem(storageKey, 'true');
      setDismissed();
      if (modal) modal.classList.add('hidden');
    });
  }
});
