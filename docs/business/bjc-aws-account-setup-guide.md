# BJC Health — AWS Account Setup Guide

**Step-by-step instructions for creating BJC Health's AWS account and granting SMEC AI deployment access.**

Prepared for Nicole Pyne · BJC Health · July 2026

---

This guide walks through everything from the 15 June email, start to finish. Total time is around **45 minutes**, and none of it requires technical knowledge — every step tells you exactly what to click and what you should see on screen.

| Part | What you'll do | Time |
| ---- | -------------- | ---- |
| 1 | Create the AWS account | ~15 min |
| 2 | Secure the master (root) login | ~10 min |
| 3 | Set the region to Sydney | ~1 min |
| 4 | Create the deployment role for SMEC AI | ~10 min |
| 5 | Send Sean two details | ~2 min |
| 6 | Set a billing alert *(optional)* | ~5 min |

If you've already completed a part, just skip ahead. And if anything on your screen doesn't match this guide, stop and call me — happy to jump on a screen share.

---

## Before you start, have ready:

- **A BJC shared mailbox** to own the account — e.g. `aws@bjchealth.com.au`. It must be a mailbox you can open (AWS emails verification codes to it). Please don't use a personal inbox — if that person ever leaves, BJC could lose access to the account.
- **A BJC company credit card** for billing
- **A mobile phone** — AWS sends a verification code during sign-up, and you'll use an authenticator app (Microsoft Authenticator, which BJC already uses, is perfect)
- **BJC's password manager** open, ready to store the new credentials

---

## Part 1 — Create the AWS account

1. Go to **aws.amazon.com** and click **Create an AWS Account** (top-right).
2. Enter:
   - **Root user email address:** `aws@bjchealth.com.au` (or your chosen shared mailbox)
   - **AWS account name:** `BJC Health`
3. Click **Verify email address**. AWS sends a code to that mailbox — open it, copy the code, and enter it.
4. **Set the root user password.** Make it long and unique, and save it in BJC's password manager straight away, labelled something like *"AWS root — BJC Health"*.
5. **Contact information:** choose **Business**, then enter BJC Health's business name, address, and phone number.
6. **Billing information:** enter the company card details. AWS bills monthly in arrears and every charge is itemised. The expected running cost for this system is small — it's covered in the Pricing & Costs document.
7. **Identity verification:** enter your mobile number, receive a code by SMS or voice call, and type it in.
8. **Support plan:** choose **Basic support — Free**. (The paid tiers are for large enterprises; you don't need them.)
9. You'll see a confirmation page. Click **Go to the AWS Management Console** and sign in — choose **Root user**, and use the email and password you just created.

> **What just happened:** BJC Health now owns a standalone AWS account. Everything built inside it — the app, the database, the AI configuration — belongs to BJC.

---

## Part 2 — Secure the master (root) login

The root login is the master key to the account. After today you'll almost never use it — but it must be protected with multi-factor authentication (MFA), the same "code from your phone" security BJC already uses for Microsoft 365.

1. Sign in to the console as the **Root user** (if you aren't already).
2. In the **search bar at the very top** of the screen, type **IAM** and click the **IAM** result (it's AWS's access-management service).
3. On the IAM dashboard you'll see a security recommendation: **Add MFA for root user**. Click it.
   - *Can't see it?* Click BJC Health's account name in the **top-right corner** → **Security credentials** → scroll to **Multi-factor authentication (MFA)** → **Assign MFA device**.
4. Give the device a name like `bjc-root-mfa` and choose **Authenticator app** → **Next**.
5. Click **Show QR code**, scan it with Microsoft Authenticator on your phone, then type in **two consecutive codes** from the app as they appear. Click **Add MFA**.
6. In the password manager, note **which phone** holds the MFA codes alongside the root email and password.

> **From here on:** the root login is for emergencies only. Day-to-day access happens through scoped logins like the one you're about to create in Part 4.

---

## Part 3 — Set the region to Sydney

1. Look at the **top-right of the console**, next to the account name. There's a region selector — it may currently say something like *N. Virginia* or *Ohio*.
2. Click it and choose **Asia Pacific (Sydney) ap-southeast-2**.

> **Why this matters:** this makes Sydney your default view, and everything I build will be pinned to the Sydney data centre. The AI component also uses Melbourne. Both are Australian data centres — no patient data ever leaves the country.

---

## Part 4 — Create the deployment role for SMEC AI

This is the "contractor pass" from step 5 of my email. In plain terms: it's a scoped, revocable login that lets me build the system **inside BJC's account**. Three things to know about it:

- **Only I can use it.** It's locked to my specific SMEC AI login — not to anyone else, at SMEC AI or elsewhere.
- **Everything is logged.** AWS records every action the role takes, in a log BJC owns.
- **You can revoke it instantly.** Deleting the role (Part 4 shows where it lives) cuts my access off immediately, at any time, no notice needed.

### Steps

1. In the top search bar, type **IAM** and open it.
2. In the **left-hand menu**, click **Roles**, then the blue **Create role** button.
3. **Step 1 — Select trusted entity.** Under *Trusted entity type*, select **Custom trust policy** (bottom-left option).
4. A JSON text editor appears below with some placeholder text. **Select all of it and replace it** with exactly this:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": { "AWS": "arn:aws:iam::843448676102:user/sean" },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```

   *In plain English, this says: "only the login named `sean` in SMEC AI's AWS account (843448676102) may use this role." No one else, anywhere.*

5. Click **Next**.
6. **Step 2 — Add permissions.** In the search box, type **AdministratorAccess**. Tick the checkbox next to the policy named exactly **AdministratorAccess** (it will be at the top of the list). Click **Next**.

   *Why administrator? Building the system means creating the app, the database, the AI connection, and the internal service permissions that link them — which needs broad build rights. The protection isn't a narrower toolset; it's that only I can use the role, every action is logged, and you can delete it whenever you like — including after the build is done.*

7. **Step 3 — Name, review, and create.**
   - **Role name:** `smec-deployment-role`
   - **Description:** `SMEC AI deployment access - revocable by BJC Health at any time`
8. Scroll down to confirm Step 1 shows your trust policy and Step 2 shows *AdministratorAccess*, then click **Create role**.
9. A green banner confirms the role was created. Click **View role** (or click `smec-deployment-role` in the roles list).
10. Near the top you'll see **ARN** — a long identifier that looks like:

    ```
    arn:aws:iam::123456789012:role/smec-deployment-role
    ```

    Click the **copy icon** next to it and paste it somewhere handy — you're sending it to me in the next part.

---

## Part 5 — Send Sean two details

1. **The account ID:** click BJC Health's account name in the **top-right corner** of the console. The menu shows a 12-digit **Account ID** with a copy icon — copy it.
2. **The role ARN** you copied at the end of Part 4.

Email both to **sean@smecai.au**. That's everything I need to begin the build.

*(Neither of these is a password — they're identifiers, a bit like a BSB and account number. Still, keep them to email between us rather than posting them anywhere public.)*

---

## Part 6 — Optional: set a billing alert

A budget alert emails you if AWS spend ever drifts above what you expect. I'll set up proper alerting as part of the build, so you can skip this — but if you'd like one from day one:

1. In the top search bar, type **Billing** and open **Billing and Cost Management**.
2. In the left-hand menu, click **Budgets** → **Create budget**.
3. Keep **Use a template** selected, and choose **Monthly cost budget**.
4. Set the amount — e.g. **$100** — and enter the email address that should get the alert (your `aws@` mailbox works well).
5. Click **Create budget**. You'll now get an email if actual or forecast spend passes the threshold.

---

## Common questions

**What can Sean actually do with this role?**
Build and configure the system inside BJC's account — the app, dashboard, database, AI connection, and alerts. Every action the role takes is recorded in the account's audit log (a service called CloudTrail), which BJC owns. The role cannot use or change the root login, and it cannot close the account.

**How do we remove Sean's access?**
IAM → **Roles** → tick `smec-deployment-role` → **Delete**. Access ends immediately. The system keeps running — the role is only for building and updating it, not for day-to-day operation.

**Who pays for what?**
AWS bills BJC directly to the card from Part 1, itemised monthly. SMEC AI never touches BJC's billing.

**What if something on screen doesn't match this guide?**
AWS occasionally moves buttons around. Stop where you are and call or email me — a two-minute screen share usually sorts it.

---

## Final checklist

- [ ] Account created with a **shared** BJC mailbox as the root email
- [ ] Root password stored in BJC's password manager
- [ ] MFA enabled on the root login (and the MFA phone noted)
- [ ] Support plan: **Basic (free)**
- [ ] Region set to **Asia Pacific (Sydney)**
- [ ] `smec-deployment-role` created with the trust policy from Part 4
- [ ] **Account ID + role ARN emailed to sean@smecai.au**
- [ ] *(Optional)* monthly budget alert created

---

**Sean O'Reilly** · AI Agent Implementation Lead\
M: 0422 523 258 · E: sean@smecai.au · W: smecai.au\
SMEC AI | 3/45 Wangaratta Street, Richmond | Victoria
