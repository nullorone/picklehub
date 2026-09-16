const response = http.get(`${E2E_MAILBOX_URL}?recipient=${encodeURIComponent(E2E_EMAIL)}`);
if (response.status !== 200 || typeof response.body.magicLink !== 'string') {
    throw new Error('The isolated E2E mailbox did not return a magic link.');
}
output.magicLink = response.body.magicLink;
