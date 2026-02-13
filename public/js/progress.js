document.addEventListener('DOMContentLoaded', function() {
  var campaignId = window.CAMPAIGN_ID;
  if (!campaignId) return;

  var progressBar = document.getElementById('progress-bar');
  var statSent = document.getElementById('stat-sent');
  var statFailed = document.getElementById('stat-failed');
  var statTotal = document.getElementById('stat-total');
  var logEntries = document.getElementById('log-entries');
  var rateWarning = document.getElementById('rate-warning');
  var rateLimitHit = document.getElementById('rate-limit-hit');
  var doneActions = document.getElementById('done-actions');

  var total = parseInt(statTotal.textContent) || 1;

  function updateProgress(sent, failed) {
    var pct = Math.round(((sent + failed) / total) * 100);
    progressBar.style.width = pct + '%';
    statSent.textContent = sent;
    statFailed.textContent = failed;
  }

  function addLogEntry(data) {
    var div = document.createElement('div');
    div.className = 'log-entry log-' + data.status;
    var text = data.status === 'sent' ? 'Sent' : 'Failed';
    if (data.error) text += ': ' + data.error;
    div.textContent = '[' + (data.sent + data.failed) + '/' + total + '] ' + text;
    logEntries.appendChild(div);
    logEntries.scrollTop = logEntries.scrollHeight;
  }

  var source = new EventSource('/campaign/' + campaignId + '/progress-stream');

  source.onmessage = function(event) {
    var data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    if (data.total) {
      total = data.total;
      statTotal.textContent = total;
    }

    updateProgress(data.sent || 0, data.failed || 0);

    if (data.approaching) {
      rateWarning.style.display = 'block';
    }

    if (data.rateLimitHit) {
      rateLimitHit.style.display = 'block';
    }

    if (data.recipientId) {
      addLogEntry(data);
    }

    if (data.done) {
      source.close();
      doneActions.style.display = 'block';

      if (data.error) {
        var errDiv = document.createElement('div');
        errDiv.className = 'flash flash-error';
        errDiv.textContent = 'Error: ' + data.error;
        doneActions.parentNode.insertBefore(errDiv, doneActions);
      }
    }
  };

  source.onerror = function() {
    // SSE connection lost — fall back to polling
    source.close();

    var pollInterval = setInterval(function() {
      fetch('/api/campaign/' + campaignId + '/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          updateProgress(data.sent_count || 0, data.failed_count || 0);
          if (data.total_count) {
            total = data.total_count;
            statTotal.textContent = total;
          }
          if (['sent', 'paused', 'resume_tomorrow'].includes(data.status)) {
            clearInterval(pollInterval);
            doneActions.style.display = 'block';
          }
        });
    }, 3000);
  };
});
