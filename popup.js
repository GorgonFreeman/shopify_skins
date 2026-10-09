const themeInput = document.getElementById('themeInput');
const useGradient = document.getElementById('useGradient');
const saveButton = document.getElementById('saveButton');
const status = document.getElementById('status');

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status${ kind ? ` ${ kind }` : '' }`;
}

async function hydrate() {
  const theme = await loadTheme();
  themeInput.value = formatThemeInput({
    ...theme,
    useGradient: false,
  });
  useGradient.checked = Boolean(theme.useGradient);
}

async function save() {
  try {
    const parsed = parseThemeInput(themeInput.value);
    parsed.useGradient = useGradient.checked;
    await saveTheme(parsed);
    setStatus('Theme saved. Reload admin if needed.', 'ok');
  } catch (error) {
    setStatus(error.message || 'Could not save theme.', 'error');
  }
}

saveButton.addEventListener('click', save);
themeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    save();
  }
});

hydrate();
