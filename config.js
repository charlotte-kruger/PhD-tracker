/* OneDrive connection settings. Leave clientId empty to use the app in "this device only" mode,
   or paste your Microsoft Entra Application (client) ID here (or enter it in Settings > Data & sync).
   A client ID is NOT a secret: this is a public single-page-app client using PKCE. */
window.PHD_CONFIG = {
  clientId: '',
  // 'common' = work/school AND personal Microsoft accounts. Use 'consumers' for personal-only.
  authority: 'https://login.microsoftonline.com/common',
};
