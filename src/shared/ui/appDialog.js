function createDialogShell({ title, message, tone = 'default' }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'app-dialog-backdrop';

  const panel = document.createElement('div');
  panel.className = `app-dialog-panel app-dialog-panel-${tone}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const heading = document.createElement('h2');
  heading.className = 'app-dialog-title';
  heading.textContent = title;

  const body = document.createElement('p');
  body.className = 'app-dialog-message';
  body.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'app-dialog-actions';

  panel.append(heading, body, actions);
  backdrop.append(panel);
  document.body.append(backdrop);

  return { backdrop, panel, actions };
}

function makeButton(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function closeDialog(backdrop) {
  backdrop.remove();
}

export function confirmAction(message, options = {}) {
  const {
    title = 'Confirmar acao',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    tone = 'danger',
  } = options;

  return new Promise((resolve) => {
    const { backdrop, actions } = createDialogShell({ title, message, tone });
    const cancelButton = makeButton(cancelLabel, 'app-dialog-button app-dialog-button-secondary');
    const confirmButton = makeButton(confirmLabel, 'app-dialog-button app-dialog-button-primary');

    const finish = (value) => {
      closeDialog(backdrop);
      resolve(value);
    };

    cancelButton.addEventListener('click', () => finish(false));
    confirmButton.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish(false);
    });

    actions.append(cancelButton, confirmButton);
  });
}

export function showAppAlert(message, options = {}) {
  const { title = 'Aviso', okLabel = 'Entendi', tone = 'default' } = options;

  return new Promise((resolve) => {
    const { backdrop, actions } = createDialogShell({ title, message, tone });
    const okButton = makeButton(okLabel, 'app-dialog-button app-dialog-button-primary');

    okButton.addEventListener('click', () => {
      closeDialog(backdrop);
      resolve();
    });

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closeDialog(backdrop);
        resolve();
      }
    });

    actions.append(okButton);
  });
}

export function promptAction(message, defaultValue = '', options = {}) {
  const {
    title = 'Copiar texto',
    confirmLabel = 'Concluido',
    cancelLabel = 'Cancelar',
  } = options;

  return new Promise((resolve) => {
    const { backdrop, panel, actions } = createDialogShell({ title, message, tone: 'default' });
    const input = document.createElement('textarea');
    input.className = 'app-dialog-textarea';
    input.value = defaultValue;
    input.readOnly = true;

    const cancelButton = makeButton(cancelLabel, 'app-dialog-button app-dialog-button-secondary');
    const confirmButton = makeButton(confirmLabel, 'app-dialog-button app-dialog-button-primary');

    const finish = (value) => {
      closeDialog(backdrop);
      resolve(value);
    };

    cancelButton.addEventListener('click', () => finish(null));
    confirmButton.addEventListener('click', () => finish(input.value));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish(null);
    });

    panel.insertBefore(input, actions);
    actions.append(cancelButton, confirmButton);

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}
