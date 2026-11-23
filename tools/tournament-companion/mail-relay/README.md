# Connect the tournament mailbox

## Organizer setup

1. Sign in to the Gmail account that should send and receive the match ZIPs. Open [a new Apps Script project](https://script.google.com/home/projects/create).
2. Replace the contents of the editor’s `Code.gs` with [Code.gs](./Code.gs) from this folder. Save the project.
3. Select `setupMatchEmail` at the top of the editor and click **Run**. Approve Google’s request to send email. This creates a separate key for each operator.
4. Select **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Click **Deploy** and copy the web app URL ending in `/exec`.
5. Open **Project Settings → Script properties**. Give each operator the deployment URL and their own key (`OPERATOR_1` or `OPERATOR_2`) privately. To revoke a key, delete that property. Running `setupMatchEmail` again generates a replacement for a missing key.

## On each operator’s PC

In Race Desk, open **Export Match → Email settings**. Paste the deployment URL and operator key, then click **Connect sender**. The Helper checks the key with Google. Each Windows user saves their connection once.

Select the matchup, finalize a result and click **Send Match**. The organizer receives the same ZIP available under **Download match ZIP**. The email subject identifies the bracket match. To publish, upload the attachment to the repository’s `imports` folder and run **Import approved match** with its filename.

An unchanged ZIP gets one receipt across both PCs. A corrected export can be sent again. If delivery is unconfirmed, check Gmail **Sent** for the match and attachment first. If the email is missing, remove the `MAIL_` script property whose value shows `pending` and that filename, then retry. Keep the operator keys private.
