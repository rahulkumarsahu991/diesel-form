# Diesel Approval System

3-stage workflow: **Calling Team → Manager → Diesel Team**. Saara data Google Sheet me automatically store hota hai.

---

## 🔑 Login Details

Har page ka apna alag login hai:

| Page | Kiske liye | User ID | Password |
|---|---|---|---|
| `index.html` | Director / Developer (overview + sab links) | `Admin` | `Daman@11` |
| `calling-form.html` | Calling Team | `Caller1` | `Calling@11` |
| `manager-approval.html` | Manager | `Manager2` | `Manager@11` |
| `diesel-dispense.html` | Diesel Team | `Diesel3` | `Diesel@11` |

Login browser tab band hone tak yaad rehta hai. Password badalna ho to us page ki HTML file kholo, `<script>` ke shuru me `USER` / `PASS` wali line edit kar do.

---

## 👥 Kisko kaunsa link dena hai

| Team | File | Kaam |
|---|---|---|
| Calling Team | `calling-form.html` | Naya diesel request bharna, apni requests ka status dekhna |
| Manager | `manager-approval.html` | Request check/edit karke Approve ya Reject, vehicle-wise history dekhna |
| Diesel Team | `diesel-dispense.html` | Approved list se select karke diesel dena, receipt print |
| Director / Developer | `index.html` | Poora overview (stats + saari requests), sab links ek jagah |

Har team ko **sirf uska apna link** share karo (WhatsApp/email se).

---

## 🔄 Poora Flow

1. **Calling Team** form bharti hai:
   - Vehicle No — type karte hi fleet list se suggestions aati hain, saath me us gaadi ki **last 5 refueling history** bhi dikhti hai
   - Driver ID daalte hi **Name + Mobile apne aap** fill ho jaate hain
   - Odometer (KM), Requested Liters, Route/Trip (searchable), Current Location (GPS button bhi hai)
   - Submit karte hi ek **Request ID** milta hai (DSL001, DSL002...)

2. **Manager** apne page par Pending list dekhta hai, chahe to data edit karta hai (vehicle, driver, liters, remarks), phir **Approve** ya **Reject** dabata hai.

3. **Diesel Team** ko approved request unke "Requests" list me turant dikh jaati hai — click karke dispense form khulta hai:
   - Diesel Pump / Location (searchable)
   - **Rate per Liter** daalte hi **Amount apne aap calculate** ho jaata hai (Rate × Approved Liters)
   - Confirm karte hi **Receipt** ban jaati hai (print ho sakti hai)

4. Poora data (create se dispense tak, Rate/Amount samet) Google Sheet ke **"Requests"** tab me automatically save hota rehta hai.

---

## 📊 Data kahan se aata hai

Ye system 3 aur Google Sheets se live data padhta hai (read-only):

| Kya | Sheet | Tab | Column |
|---|---|---|---|
| Vehicle list | [Diesel Sheet](https://docs.google.com/spreadsheets/d/1EEks9zfIjnYKxARCN6nBTVTxboV19_i32Gg16BzGZdk) | `fleet s vehical` | C |
| Pump / Location list | same Diesel Sheet | `NEW DIESEL&UREA` | A |
| Route / Trip list | [Routes Sheet](https://docs.google.com/spreadsheets/d/1wgG2K9phHMQPvIskvXF1OBHxNHFk8pegrKCi0hvuF6U) | `Routes` | C (From) + D (To) |
| Driver ID → Name/Mobile | [Driver Sheet](https://docs.google.com/spreadsheets/d/1wLY9CttPw-7FPP58aKLr0Ykf-Ok9uFg5B_kBGuWA-MA) | `Driver Details` | A=ID, B=Name, C=Mobile |

Vehicle No, Pump, aur Route — teeno free-text bhi hain: agar list me match na mile to jo type kiya wahi save ho jaata hai.

Ye lists 6 ghante ke liye cache hoti hain (speed ke liye). Sheet me naya vehicle/pump/route add karo to max 6 ghante me apne aap aa jaayega.

---

## ⚙️ Setup (agar naye sirey se karna ho)

1. Google Sheet banao (naam: "Diesel Approval Data")
2. `Extensions > Apps Script` → default code hata kar `Code.gs` ka poora content paste karo → Ctrl+S
3. `Deploy > New deployment` → gear ⚙️ → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy → permissions Allow karo (Advanced → Go to project → Allow)
4. Jo `/exec` URL mile use chaaron HTML files me `var APPS_SCRIPT_URL = "..."` line me paste karo
5. Sheet me "Requests" tab apne aap ban jaayega

**Code.gs me change karne ke baad**: `Deploy > Manage deployments` → pencil ✏️ → Version: **New version** → Deploy. (New deployment mat banana, warna URL badal jaayega.)

---

## 🧹 Saara data clear karna (test data hatane ke liye)

Apps Script editor me:
1. Function dropdown me **`resetAllRequests`** chuno
2. **Run (▶)** dabao

Isse "Requests" tab ki saari rows delete ho jaayengi (header safe rahega) aur agli request dobara **DSL001** se shuru hogi.

⚠️ Ye wapas nahi ho sakta — chalane se pehle confirm kar lo.

---

## ⚠️ Security Note

Login sirf simple client-side gate hai (page ke source me password dikh sakta hai kisi technical vyakti ko). Normal team use ke liye theek hai, lekin ye bank-level security nahi hai.

Isi tarah, diesel dispense me OTP step jaan-boojh kar hataya gaya hai (flow tez karne ke liye) — matlab jiske paas `diesel-dispense.html` ka link aur password hai wo kisi bhi Approved request ko dispense kar sakta hai.
