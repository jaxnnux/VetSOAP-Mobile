# Google Play Service Account Setup

This guide walks through creating a Google Cloud Service Account with a JSON key for automated Google Play Store submissions via `eas submit`.

## Prerequisites

- A Google Play Console developer account ([play.google.com/console](https://play.google.com/console))
- An app already created in Google Play Console
- Access to Google Cloud Console ([console.cloud.google.com](https://console.cloud.google.com))

## Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top of the page (next to "Google Cloud")
3. Click **"New Project"** in the top-right of the modal
4. Enter a project name (e.g., `captivet-play-api`)
5. Leave organization as-is (or select yours if applicable)
6. Click **"Create"**
7. Wait for the notification that the project has been created, then select it from the project dropdown

## Step 2: Enable the Google Play Android Developer API

1. In your Google Cloud project, go to **APIs & Services** > **Library** (left sidebar)
2. Search for **"Google Play Android Developer API"**
3. Click on the result — it should say "Google Play Android Developer API" by Google
4. Click the **"Enable"** button
5. Wait for it to finish enabling (you'll be redirected to the API overview page)

> This API is what allows external tools (like EAS CLI) to upload builds and manage releases on your behalf.

## Step 3: Create a Service Account

1. In Google Cloud Console, go to **IAM & Admin** > **Service Accounts** (left sidebar)
   - Or navigate directly: APIs & Services > Credentials > click **"+ Create Credentials"** > **Service Account**
2. Fill in the service account details:
   - **Service account name:** `eas-submit` (or any descriptive name)
   - **Service account ID:** auto-generated from the name (e.g., `eas-submit@captivet-play-api.iam.gserviceaccount.com`)
   - **Description:** (optional) `Used by EAS CLI to submit builds to Google Play`
3. Click **"Create and Continue"**
4. **Grant this service account access to project** — you can skip this step (click **"Continue"**). Permissions are managed in Google Play Console, not here.
5. **Grant users access to this service account** — skip this too (click **"Done"**)

## Step 4: Generate the JSON Key

1. You should now see your service account in the list at **IAM & Admin** > **Service Accounts**
2. Click on the service account you just created (click the email link)
3. Go to the **"Keys"** tab at the top
4. Click **"Add Key"** > **"Create new key"**
5. Select **"JSON"** as the key type
6. Click **"Create"**
7. The JSON key file will automatically download to your computer
8. **Store this file securely** — it grants API access to your Play Console. Do not commit it to git.

> The downloaded file will look something like `captivet-play-api-abc123def456.json`. Rename it to something memorable like `play-service-account.json`.

## Step 5: Note the Service Account Email

Before leaving Google Cloud Console, copy the service account email address. It looks like:

```
eas-submit@captivet-play-api.iam.gserviceaccount.com
```

You'll need this in the next step.

## Step 6: Grant Permissions in Google Play Console

1. Go to [play.google.com/console](https://play.google.com/console)
2. In the left sidebar, click **"Users and permissions"**
3. Click **"Invite new users"**
4. In the **email address** field, paste the service account email from Step 5
5. Set the **access expiry** to "Never" (or set a date if you prefer to rotate)
6. Under **Permissions**, choose one of:
   - **Admin** (full access — simplest, recommended for personal accounts)
   - Or grant specific permissions:
     - **App access:** Select your app (Captivet) or "All apps"
     - Enable at minimum:
       - **Releases** — create, edit, and roll out releases
       - **Production access** — release to production track
       - **Testing** — manage testing tracks (internal, closed, open)
7. Click **"Invite user"**
8. You'll see a confirmation. Click **"Send invite"**

> **Important:** Google states it can take up to 24-36 hours for the service account permissions to fully propagate. In practice it's usually faster, but if `eas submit` fails with a permission error right away, wait and retry.

## Step 7: Use the JSON Key with EAS Submit

### Option A: Pass the key file path directly

```bash
eas submit --platform android \
  --service-account-key-path ./play-service-account.json \
  --track internal
```

### Option B: Configure it in eas.json

Add a `submit` block to your `eas.json`:

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

Then run:

```bash
eas submit --platform android --profile production
```

### Option C: Let EAS CLI prompt you

Just run `eas submit --platform android` and it will ask for the key file path interactively.

## Security Notes

- **Never commit the JSON key to git.** Add it to `.gitignore`:
  ```
  play-service-account.json
  *-service-account*.json
  ```
- The JSON key grants programmatic access to your Play Console. Treat it like a password.
- If the key is ever compromised, go to Google Cloud Console > Service Accounts > Keys and delete the compromised key, then generate a new one.
- You can create multiple keys for the same service account if needed (e.g., one for CI, one for local use).

## Troubleshooting

### "API access" page not visible in Play Console
Newer Play Console accounts may not show a dedicated "API access" page under Setup. Use the **Users and permissions** approach described in Step 6 instead — invite the service account email as a user.

### Permission errors after setup
The Google Play Developer API can take up to 36 hours to fully activate for new service accounts. If you get 403/permission errors, wait and retry.

### "The caller does not have permission" error
Ensure that:
1. The Google Play Android Developer API is enabled (Step 2)
2. The service account was invited in Play Console with the correct permissions (Step 6)
3. You're using the correct JSON key file for the right service account

### EAS Submit hangs or times out
Make sure you're using `--non-interactive` flag in CI environments, and that the `serviceAccountKeyPath` is correct and the file is readable.
