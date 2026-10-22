/* =========================================================
   Web generada desde Jotform — lógica del formulario
   Validación client-side + navegación multipágina
   ========================================================= */

(function () {
  'use strict';

  var form = document.getElementById('hh-form');
  if (!form) return;

  var CFG = window.HH_CONFIG || { calculations: [], conditions: [], clearOnHide: false, autoNext: false, thankYou: '' };

  var pages = Array.prototype.slice.call(form.querySelectorAll('.hh-page'));
  var btnsPrev = Array.prototype.slice.call(form.querySelectorAll('[data-hh="prev"]'));
  var btnNext = form.querySelector('[data-hh="next"]');
  var btnSubmit = form.querySelector('[data-hh="submit"]');
  var progress = document.querySelector('.hh-progress');
  var progressBar = document.querySelector('.hh-progress-bar');
  var toast = document.getElementById('hh-toast');
  var mode = form.getAttribute('data-mode') || 'demo';
  var current = 0;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function labelOf(el) {
    var field = el.closest('.hh-field');
    if (!field) return 'Este campo';
    var lab = field.querySelector('.hh-label, .hh-group legend');
    return lab ? lab.textContent.replace('*', '').trim() : 'Este campo';
  }

  function errorEl(el) {
    var field = el.closest('.hh-field');
    return field ? field.querySelector('.hh-error') : null;
  }

  function setError(el, msg) {
    var p = errorEl(el);
    if (msg) {
      el.setAttribute('aria-invalid', 'true');
      if (p) {
        p.textContent = msg;
        p.hidden = false;
      }
    } else {
      el.removeAttribute('aria-invalid');
      if (p) {
        p.textContent = '';
        p.hidden = true;
      }
    }
  }

  function inputsOfField(field) {
    return Array.prototype.slice.call(
      field.querySelectorAll('input, select, textarea')
    ).filter(function (el) {
      return el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button';
    });
  }

  function groupChecked(field) {
    var name = null;
    var inputs = inputsOfField(field).filter(function (el) {
      return (el.type === 'radio' || el.type === 'checkbox') && el.name;
    });
    if (!inputs.length) return false;
    name = inputs[0].name;
    return inputs.some(function (el) {
      if (el.type === 'radio') return el.checked;
      if (el.type === 'checkbox' && !el.dataset.hhOther) return el.checked;
      return false;
    });
  }

  function validateField(field) {
    if (!field || field.hidden) return true;
    if (field.style.display === 'none') return true;
    var inputs = inputsOfField(field);
    if (!inputs.length) return true;
    var first = inputs[0];
    var required = field.dataset.required === '1';

    if (first.type === 'radio' || (first.type === 'checkbox' && !first.closest('.hh-terms-wrap'))) {
      var anyChecked = inputs.some(function (el) {
        return (el.type === 'radio' || el.type === 'checkbox') && el.checked && !el.dataset.hhOther;
      });
      if (required && !anyChecked) {
        setError(first, 'Selecciona una opción para «' + labelOf(first) + '».');
        return false;
      }
      setError(first, '');
      return true;
    }

    if (first.type === 'checkbox') {
      if (required && !first.checked) {
        setError(first, 'Debes aceptar para continuar.');
        return false;
      }
      var termsOther = field.querySelector('input[data-hh-other-target]:not([hidden])');
      if (termsOther && termsOther.dataset.hhRequired === '1' && !termsOther.value.trim()) {
        setError(termsOther, 'Escribe tu respuesta en «Otro».');
        return false;
      }
      setError(first, '');
      return true;
    }

    var otherActive = field.querySelector('input[data-hh-other-target]:not([hidden])');
    if (
      otherActive &&
      (first.type === 'radio' || first.type === 'checkbox') &&
      otherActive.dataset.hhRequired === '1' &&
      !otherActive.value.trim()
    ) {
      setError(otherActive, 'Escribe tu respuesta en «Otro».');
      return false;
    }

    var value = (first.value || '').trim();
    if (required && !value) {
      setError(first, '«' + labelOf(first) + '» es obligatorio.');
      return false;
    }

    if (value) {
      if (first.type === 'email' && !EMAIL_RE.test(value)) {
        setError(first, 'Introduce un correo electrónico válido.');
        return false;
      }
      if (first.type === 'number' || first.dataset.hhNumeric === '1') {
        if (isNaN(Number(value))) {
          setError(first, 'Introduce un número válido.');
          return false;
        }
        if (first.dataset.hhInteger === '1' && !Number.isInteger(Number(value))) {
          setError(first, 'Introduce un número entero.');
          return false;
        }
        if (first.min !== '' && Number(value) < Number(first.min)) {
          setError(first, 'El valor mínimo es ' + first.min + '.');
          return false;
        }
        if (first.max !== '' && Number(value) > Number(first.max)) {
          setError(first, 'El valor máximo es ' + first.max + '.');
          return false;
        }
      }
      if (first.type === 'url' && !/^https?:\/\/.+/i.test(value)) {
        setError(first, 'La URL debe empezar por http:// o https://');
        return false;
      }
      if (first.dataset.hhDate === '1') {
        var min = first.min || field.dataset.dateMin || '';
        var max = first.max || field.dataset.dateMax || '';
        if (min && value < min) {
          setError(first, 'La fecha no puede ser anterior a ' + min + '.');
          return false;
        }
        if (max && value > max) {
          setError(first, 'La fecha no puede ser posterior a ' + max + '.');
          return false;
        }
      }
    }

    setError(first, '');
    return true;
  }

  function validatePage(index) {
    var page = pages[index];
    if (!page) return true;
    var fields = Array.prototype.slice.call(page.querySelectorAll('.hh-field'));
    var ok = true;
    var firstBad = null;
    fields.forEach(function (f) {
      var res = validateField(f);
      if (!res && ok) {
        ok = false;
        firstBad = f.querySelector('[aria-invalid="true"]');
      }
    });
    if (!ok && firstBad) {
      firstBad.focus({ preventScroll: false });
      var box = firstBad.closest('.hh-field');
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  function validateAll() {
    for (var i = 0; i < pages.length; i++) {
      if (!validatePage(i)) {
        goTo(i);
        return false;
      }
    }
    return true;
  }

  function goTo(index) {
    current = Math.max(0, Math.min(index, pages.length - 1));
    pages.forEach(function (p, i) {
      p.classList.toggle('is-active', i === current);
    });
    var multi = pages.length > 1;
    btnsPrev.forEach(function (b) { b.hidden = !multi || current === 0; });
    if (btnNext) btnNext.hidden = !multi || current === pages.length - 1;
    if (btnSubmit) btnSubmit.hidden = multi && current !== pages.length - 1;
    if (progress) progress.hidden = !multi;
    if (progressBar && multi) {
      progressBar.style.width = (((current + 1) / pages.length) * 100).toFixed(1) + '%';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =======================================================
     Motor de cálculos (ecuaciones Jotform: {qid})
     ======================================================= */

  function fieldValueByQid(qid) {
    var el = document.getElementById('f-' + qid);
    if (!el) return '';
    if (el.type === 'radio') {
      var checked = form.querySelectorAll(
        'input[type="radio"][name="' + CSS.escape(el.name) + '"]:checked'
      );
      return checked.length ? checked[0].value : '';
    }
    if (el.type === 'checkbox') {
      var els = form.querySelectorAll(
        'input[type="checkbox"][name="' + CSS.escape(el.name) + '"]:checked'
      );
      return Array.prototype.map.call(els, function (c) {
        return c.value;
      });
    }
    if (el.type === 'file') return '';
    return el.value;
  }

  function numericByQid(qid) {
    var v = fieldValueByQid(qid);
    if (Array.isArray(v)) {
      var sum = 0;
      v.forEach(function (x) {
        var n = parseFloat(x);
        if (!isNaN(n)) sum += n;
      });
      return sum;
    }
    var n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function evalCalculation(c) {
    var expr = String(c.equation).replace(/^\s*\[/, '').replace(/\]\s*$/, '');
    expr = expr.replace(/\{(\d+)\}/g, function (_, qid) {
      if (String(qid) === String(c.resultField)) return '0';
      return '(' + numericByQid(qid) + ')';
    });
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
    try {
      var v = Function('"use strict"; return (' + expr + ');')();
      return typeof v === 'number' && isFinite(v) ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function topoCalcs(calcs) {
    var byResult = {};
    calcs.forEach(function (c) {
      byResult[String(c.resultField)] = c;
    });
    var done = {};
    var out = [];
    var guard = 0;
    while (out.length < calcs.length && guard++ < 30) {
      calcs.forEach(function (c) {
        if (done[String(c.resultField)]) return;
        var deps = (c.operands || []).filter(function (o) {
          return byResult[String(o)] && String(o) !== String(c.resultField);
        });
        if (deps.every(function (d) { return done[String(d)]; })) {
          done[String(c.resultField)] = true;
          out.push(c);
        }
      });
    }
    calcs.forEach(function (c) {
      if (!done[String(c.resultField)]) out.push(c);
    });
    return out;
  }

  var calcOrder = topoCalcs(CFG.calculations || []);

  function runCalculations() {
    if (!calcOrder.length) return;
    for (var pass = 0; pass < 2; pass++) {
      calcOrder.forEach(function (c) {
        var v = evalCalculation(c);
        if (v === null) return;
        var el = document.getElementById('f-' + c.resultField);
        if (!el) return;
        var dec = typeof c.decimals === 'number' ? c.decimals : 2;
        el.value = v.toFixed(dec);
      });
    }
  }

  /* =======================================================
     Condiciones (show/hide/require de Jotform)
     ======================================================= */

  var condShowTargets = {};
  (CFG.conditions || []).forEach(function (r) {
    (r.actions || []).forEach(function (a) {
      if (a.visibility === 'Show') {
        if (a.field) condShowTargets[String(a.field)] = true;
        (a.fields || []).forEach(function (f) {
          condShowTargets[String(f)] = true;
        });
      }
    });
  });

  function condFieldEl(qid) {
    var el = document.getElementById('f-' + qid);
    if (el && el.closest && el.closest('.hh-field')) return el.closest('.hh-field');
    return form.querySelector('.hh-field[data-qid="' + qid + '"]');
  }

  function termMatches(t) {
    var v = fieldValueByQid(t.field);
    var val = String(t.value == null ? '' : t.value);
    var op = t.operator || 'equals';
    var arr = Array.isArray(v) ? v : null;
    if (op === 'equals') return arr ? arr.indexOf(val) !== -1 : String(v) === val;
    if (op === 'notEquals') return arr ? arr.indexOf(val) === -1 : String(v) !== val;
    if (op === 'contains')
      return arr
        ? arr.some(function (x) { return String(x).indexOf(val) !== -1; })
        : String(v).indexOf(val) !== -1;
    if (op === 'empty') return arr ? arr.length === 0 : String(v) === '';
    if (op === 'notEmpty') return arr ? arr.length > 0 : String(v) !== '';
    return false;
  }

  function ruleMatches(r) {
    var terms = r.terms || [];
    if (!terms.length) return false;
    if (r.link === 'Any') {
      return terms.some(termMatches);
    }
    return terms.every(termMatches);
  }

  function applyConditions() {
    var rules = CFG.conditions || [];
    if (!rules.length) return;
    var visibility = {};
    Object.keys(condShowTargets).forEach(function (qid) {
      visibility[qid] = false;
    });
    rules.forEach(function (r) {
      if (!ruleMatches(r)) return;
      (r.actions || []).forEach(function (a) {
        var targets = [];
        if (a.field) targets.push(String(a.field));
        (a.fields || []).forEach(function (f) {
          targets.push(String(f));
        });
        targets.forEach(function (qid) {
          if (a.visibility === 'Show') visibility[qid] = true;
          else if (a.visibility === 'Hide' || a.visibility === 'HideMultiple') visibility[qid] = false;
          else if (r.type === 'require') {
            var f = condFieldEl(qid);
            if (!f) return;
            if (a.visibility === 'Disable') f.dataset.required = '0';
            else if (a.visibility === 'Enable' || a.visibility === 'Require') f.dataset.required = '1';
          }
        });
      });
    });
    Object.keys(visibility).forEach(function (qid) {
      var f = condFieldEl(qid);
      if (!f) return;
      var show = visibility[qid];
      var isHidden = f.style.display === 'none';
      if (show && !isHidden) return;
      if (!show && isHidden) return;
      f.style.display = show ? '' : 'none';
      if (!show && CFG.clearOnHide) {
        Array.prototype.forEach.call(f.querySelectorAll('input, select, textarea'), function (el) {
          if (el.type === 'radio' || el.type === 'checkbox') el.checked = false;
          else if (el.type !== 'hidden' && !el.classList.contains('hh-calc')) el.value = '';
        });
      }
    });
  }

  function pageComplete(index) {
    var p = pages[index];
    if (!p) return false;
    var fields = Array.prototype.slice.call(p.querySelectorAll('.hh-field'));
    var any = false;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.style.display === 'none') continue;
      if (f.dataset.required !== '1') continue;
      any = true;
      var inputs = inputsOfField(f);
      if (!inputs.length) continue;
      var first = inputs[0];
      if (first.type === 'radio' || first.type === 'checkbox') {
        var checked = inputs.some(function (el) {
          return el.checked && !el.dataset.hhOther;
        });
        if (!checked) return false;
      } else if (!(first.value || '').trim()) {
        return false;
      }
    }
    return any;
  }

  function onFormLive() {
    applyConditions();
    runCalculations();
    if (CFG.autoNext && current < pages.length - 1 && pageComplete(current)) {
      goTo(current + 1);
    }
  }

  form.addEventListener('input', onFormLive);
  form.addEventListener('change', onFormLive);

  if (btnNext) {
    btnNext.addEventListener('click', function () {
      if (validatePage(current)) goTo(current + 1);
    });
  }
  btnsPrev.forEach(function (btn) {
    btn.addEventListener('click', function () {
      goTo(current - 1);
    });
  });

  // Botones "Otro"
  form.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.hhOtherToggle) {
      var input = form.querySelector(
        'input[data-hh-other-target="' + CSS.escape(el.dataset.hhOtherToggle) + '"]'
      );
      if (input) {
        input.hidden = !el.checked;
        input.required = el.checked && input.dataset.hhRequired === '1';
        if (el.checked) input.focus();
        else input.value = '';
      }
    }
  });

  // Validación en vivo al salir del campo
  form.addEventListener(
    'blur',
    function (e) {
      var el = e.target;
      if (el.matches && el.matches('input, select, textarea')) {
        var field = el.closest('.hh-field');
        if (field && field.dataset.touched === '1') validateField(field);
      }
    },
    true
  );

  form.addEventListener(
    'input',
    function (e) {
      var el = e.target;
      if (el.matches && el.matches('input, select, textarea') && el.getAttribute('aria-invalid')) {
        var field = el.closest('.hh-field');
        if (field) validateField(field);
      }
    },
    true
  );

  form.addEventListener(
    'focusin',
    function (e) {
      var field = e.target.closest && e.target.closest('.hh-field');
      if (field) field.dataset.touched = '1';
    },
    true
  );

  function showStatus(kind, html) {
    var box = document.createElement('div');
    box.className = 'hh-status hh-status--' + kind;
    box.setAttribute('role', 'status');
    box.innerHTML = html;
    var old = form.parentNode.querySelector('.hh-status');
    if (old) old.remove();
    form.insertAdjacentElement('afterend', box);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function collectSummary() {
    var rows = [];
    form.querySelectorAll('.hh-field').forEach(function (field) {
      var lab = field.querySelector('.hh-label, .hh-group legend');
      var label = lab ? lab.textContent.replace('*', '').trim() : '';
      if (!label) return;
      var parts = [];
      field.querySelectorAll('input:checked, select, textarea').forEach(function (el) {
        if (el.type === 'hidden') return;
        if (el.tagName === 'SELECT') {
          if (el.value) parts.push(el.selectedOptions[0].textContent.trim());
        } else if (el.type === 'file') {
          if (el.files && el.files.length) {
            parts.push(
              Array.prototype.map.call(el.files, function (f) {
                return f.name;
              }).join(', ')
            );
          }
        } else {
          parts.push(el.value && el.value !== 'on' ? el.value : 'Sí');
        }
      });
      field.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"], input[type="email"], input[type="tel"], input[type="url"]:not([hidden])').forEach(function (el) {
        if (el.value && parts.indexOf(el.value) === -1) parts.push(el.value);
      });
      if (parts.length) rows.push({ label: label, value: parts.join(', ') });
    });
    return rows;
  }

  form.addEventListener('submit', function (e) {
    if (!validateAll()) {
      e.preventDefault();
      return;
    }
    if (mode === 'jotform') {
      var btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.dataset.hhLabel = btn.textContent;
        btn.textContent = 'Enviando…';
      }
      return; // envío nativo al formulario original de Jotform
    }

    e.preventDefault();
    var summary = collectSummary();
    var html =
      (CFG.thankYou
        ? '<div class="hh-thankyou">' + CFG.thankYou + '</div>'
        : '<strong>¡Gracias! Respuesta registrada (modo demostración).</strong>') +
      '<br><span style="color:var(--hh-muted)">Esta web es una réplica estática: los datos no se envían a ningún servidor.</span>';
    if (summary.length) {
      html +=
        '<details style="margin-top:10px"><summary style="cursor:pointer">Ver resumen de la respuesta</summary><ul style="margin:8px 0 0;padding-left:18px">' +
        summary
          .map(function (r) {
            return '<li><b>' + r.label + ':</b> ' + String(r.value).replace(/</g, '&lt;') + '</li>';
          })
          .join('') +
        '</ul></details>';
    }
    showStatus('ok', html);
    form.reset();
    form.querySelectorAll('[data-hh-other-target]').forEach(function (t) {
      var input = form.querySelector(
        'input[data-hh-other-target="' + CSS.escape(t.dataset.hhOtherTarget) + '"]'
      );
      if (input) input.hidden = true;
    });
    goTo(0);
  });

  form.querySelectorAll('input[type="range"]').forEach(function (el) {
    var out = el.id ? document.querySelector('output[for="' + el.id + '"]') : null;
    if (!out) return;
    out.textContent = el.value;
    el.addEventListener('input', function () {
      out.textContent = el.value;
      runCalculations();
      applyConditions();
    });
  });

  applyConditions();
  runCalculations();
  goTo(0);
})();
