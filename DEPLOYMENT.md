# AgriConnect — Collaborator Deployment Guide

## Prerequisites
Make sure you have a free account on these platforms (no card required):
- [GitHub](https://github.com) — to fork/clone the repo
- [Neon.tech](https://neon.tech) — free cloud PostgreSQL
- [Render](https://render.com) — free backend hosting
- [Vercel](https://vercel.com) — free frontend hosting

---

## Step 1: Fork or Clone the Repository
If you are a collaborator with write access:
```bash
git clone https://github.com/yuvanraj-ai-dev/AgriConnect.git
cd AgriConnect
```
If you want your own copy, click **Fork** on GitHub first, then clone your fork.

---

## Step 2: Set Up the Database (Neon.tech)
1. Sign up at [neon.tech](https://neon.tech)
2. Click **New Project**, give it a name (e.g. `agriconnect`)
3. Select **PostgreSQL 15+** as the version
4. Once created, go to the **Dashboard** tab
5. Click **Connection String** and copy the full URL
   - It looks like: `postgresql://user:password@host.neon.tech/dbname?sslmode=require`
6. **Save this string** — you will need it in the next step

---

## Step 3: Deploy the Backend (Render)
1. Sign up at [render.com](https://render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub account and select the `AgriConnect` repo
4. Fill in the settings:
   | Field | Value |
   |---|---|
   | **Root Directory** | `backend` |
   | **Build Command** | `rm -rf node_modules && npm install && npx prisma generate && npx prisma db push` |
   | **Start Command** | `npm start` |
   | **Instance Type** | Free |

5. Click **Advanced** → **Add Environment Variables**:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | *(paste your Neon connection string)* |
   | `JWT_SECRET` | *(any random string, e.g. `mySecretKey123`)* |
   | `NODE_ENV` | `production` |

6. Click **Create Web Service** and wait for the build
7. Once deployed, **copy your backend URL** — it looks like `https://your-service.onrender.com`

---

## Step 4: Deploy the Frontend (Vercel)
1. Sign up at [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Import the `AgriConnect` GitHub repository
4. Fill in the settings:
   | Field | Value |
   |---|---|
   | **Root Directory** | `frontend` |
   | **Framework Preset** | Vite |
   | **Build Command** | *(leave as default: `npm run build`)* |
   | **Output Directory** | *(leave as default: `dist`)* |

5. Open **Environment Variables** and add:
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://your-service.onrender.com/api` *(your Render URL + `/api`)* |

6. Go to **Settings → General → Build & Development Settings**
   - Toggle ON the **Install Command** override and set it to:
     ```
     rm -rf node_modules package-lock.json && npm install
     ```
   > [!IMPORTANT]
   > This step is required to avoid a "Permission denied" error on Vite. Do not skip it.

7. Click **Deploy** and wait for it to go live

---

## Step 5: Verify Deployment
Once both are deployed, open your Vercel URL in the browser:
- You should see the **AgriConnect Login page**
- Register a new account, log in, and verify the Dashboard loads

---

## Future Updates (Day-to-Day Workflow)
Whenever new code is pushed to the `main` branch on GitHub:
- ✅ **Vercel** auto-rebuilds the frontend
- ✅ **Render** auto-deploys the backend (including any new DB tables via `prisma db push`)
- ✅ **Neon** keeps all data safe — nothing to do

The only time you need to manually visit Render or Vercel is when adding **new environment variables** (e.g. Cloudinary keys, Razorpay keys, email SMTP settings for future modules).

---

## Environment Variables Reference (Full List)
| Variable | Used In | Description |
|---|---|---|
| `DATABASE_URL` | Render (backend) | Neon PostgreSQL connection string |
| `JWT_SECRET` | Render (backend) | Any random secret string for signing tokens |
| `NODE_ENV` | Render (backend) | Set to `production` |
| `VITE_API_URL` | Vercel (frontend) | Full backend URL + `/api` |
| `CLOUDINARY_URL` | Render (backend) | *(Added in Module 1 — Soil Testing)* |
| `RAZORPAY_KEY_ID` | Render (backend) | *(Added in Module 2 — Marketplace)* |
| `RAZORPAY_SECRET` | Render (backend) | *(Added in Module 2 — Marketplace)* |
| `EMAIL_HOST` | Render (backend) | *(Added later — Email/Notifications)* |
| `EMAIL_USER` | Render (backend) | *(Added later — Email/Notifications)* |
| `EMAIL_PASS` | Render (backend) | *(Added later — Email/Notifications)* |
