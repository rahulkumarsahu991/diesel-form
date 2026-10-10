/**********************************************************************
 * DIESEL APPROVAL SYSTEM — Google Apps Script Web App (backend)
 *
 * What it does: stores/updates the 3-stage workflow's data in a Google Sheet.
 *   Stage 1 (Calling Team)  -> create   -> new request, "Pending"
 *   Stage 2 (Manager)       -> approve/reject -> edit data and approve
 *   Stage 3 (Diesel Team)   -> verify + dispense -> "Dispensed" + a receipt
 *                               number is generated
 *
 * ===================  SETUP (one time)  ===========================
 * 1. Create a new Google Sheet in Google Drive (name: "Diesel Approval Data").
 * 2. Menu: Extensions > Apps Script
 * 3. Delete all the default code and paste this entire code in.
 * 4. Save (disk icon / Ctrl+S).  
 * 5. Deploy > New deployment > gear icon > type: "Web app"
 *      - Description: Diesel approval backend
 *      - Execute as:  Me  (your account)
 *      - Who has access:  Anyone
 *    Click "Deploy", allow permissions (Advanced > Go to project > Allow).
 * 6. Copy the "/exec" URL you get — paste it into the
 *    APPS_SCRIPT_URL = "" line at the top of all three HTML files
 *    (calling-form.html, manager-approval.html, diesel-dispense.html).
 *
 * NOTE: If you change this code later, deploy a new version on the SAME
 * deployment via "Deploy > Manage deployments > Edit" — otherwise the URL
 * changes and you'll have to paste it into the HTML files again.
 *
 * NOTE (vehicle/pump/route search + driver ID lookup): This script also
 * reads data from separate Google Sheets (vehicle list, driver details,
 * pump/location list, and route list). Those sheets must be opened by the
 * same Google account this script is deployed with as "Execute as: Me"
 * (or at least have Viewer access). The first time you deploy/run it,
 * Google will show an extra permission popup ("See, edit... Google
 * Sheets") — click Allow.
 *********************************************************************/

var SHEET_NAME = 'Requests';
var OFFICE_SHEET_NAME = 'Office-Tanker'; // Office Pump/Tanker Distribution Form — separate tab, IDs prefixed "OT"
var CREDIT_SHEET_NAME = 'Credit Diesel'; // Calling form's "Credit Diesel" checkbox — separate tab, IDs prefixed "CR"
var TIMEZONE = 'Asia/Kolkata';

// Gate for the "Clear All Data" button on index.html (Director/Developer view only).
// Same password as that page's login — this is just a re-confirmation click-guard,
// not a separate secret to manage.
var ADMIN_RESET_PASSWORD = 'Daman@11';

// Gate for the Director/Admin panel's per-row "✕" delete button.
var DELETE_REQUEST_PASSWORD = 'Daman@#*11';

// ---------- Push notifications (Manager gets pinged on every new Caller request) ----------
// Firebase project "Diesel Approval Notifications". The service account below
// is only used server-side to mint a short-lived OAuth token for sending pushes
// via the FCM v1 API — it never reaches the browser.
var FCM_PROJECT_ID = 'diesel-approval-notifications';
var FCM_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@diesel-approval-notifications.iam.gserviceaccount.com';
var FCM_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDMWhrHJmyAIJ1f\ntW18gr0i2z9nKn08eY/JuPFnKvO423ivwgORkjXRvagHMz/hT6z0lZhmvC4Dc0kv\nVcPmaVwxsLI+XzVptDxnVTJk41dK/GSQjJojQVhJf+y+PhXlngkY+Hfs++W2xs7r\nMV4JAda57g8mH4aOgci8aVP3ooOSMUl4sDKkP2UjOSuMSBkJR0EaqB/6BKRcKuA7\ngo+h21qI40xBVzomXeX2dyXPt2UvAIbsZNheHRZMuDzNqiaEtCNFWY5yl/CjzLGi\nTTRIQd4Me7OyUPJS7+btZVmKwz0DHIc5LJKnyHg8k1+t06YzXgqSp7YbpkN8D2Vj\nDdnnKlNpAgMBAAECggEAAeVMze/Kx2GmEvMKzxRsHvbD7tf29IZ8Tz2lXacJPtdf\nOtlQOoTN0TlAk5zO/aXXiPBRnW85QHsDfGW/4+DpjSSZTrR1wmyF3H+uuYg6OmcI\nERTJ+NaKPWErPtAgIamSCvam1Ce5oyKJ74HUMplDu4B30d2cN7FuT9Mjmaoa5AAs\nKGqUjiCqGD/Cga6a5ks9EtEomBocKEn/xsfif6+5QKcnW2nfBgyFaX24J8LPdXHL\nixcHvBlYu3OAiNFQ9C5jRIzSFDev7Dud3Z+JMvT0oWb9YFZRuY6dJyPM24ydZ9j9\nBIm6XnPacgTAn5LCv5Kde1wgQ9DVPZkh7RnzJfPJtQKBgQDvwGKRdXYUZe/urF24\nL7fO4hBxYKKnFwsXJXKMCdduLnpVmNfW3TGKf9dasXUirldxNnkjdrYZyUGDC9D5\n87Z2gRLgLtw/BsFlSaO5TToCaTD0N+63CwtL4ntXQ1E2wVwqjQ1LmNuXHi9qw1lv\nIouGFj3Yg1ax2hvTKoNOW5IBxQKBgQDaM4xtYL3xYwLe0YWWDauvIjFWZN9oArGG\nnlk5U46HTSulvOYgiJoMoGQPIWa5zP6CK+G0ZfoailAZCq6yRklLdr7fwVPmOLxl\nGpwM+idL9b4Q5OEKO3bEM42CH9h8S2uxIePqLglcL/o0322FxaRugp/FaFOyHVm3\noNrtCS2ZVQKBgFlR82b9u+AdmiXxUXktTe1li3qx5ecaTqdw7BwADqKd7jW1m7QQ\n9EQFHNZNBrbE/Q7QnJD5yR4SPLX10QVOJsw/iii7TJKukZ6KsNR4UQRU7EgQDn9j\nPfInjowUKE2d/BheNHXVnPnP5RqBbPBajmCGKMRhKgtYlsU1MXYf52WBAoGAOWZG\nEp/YV5+MKcFEOuzttOxxviBbBKlwudD9966bV8xdJwRCJVzJ6Xhn2fMXatkaOnQA\ns8v/tuublnrQ6eTDcy6Rl5rrzywtowsU8fT8UWcb0KXk7SQnYgWNvCVUdZ4Bfl9D\n7V6e57lXQIFl9kK/trJ2BSAkpD5EU6Hk9WXssOECgYAYzaZx1U56KlvUw+TnjUu6\ngdf3XgcsROHGWrCyIJFT0fx1YKvxWnslFkxPHRDVtfVBcf0m1ShPyGQf7Vq56CrE\nLHmu2DCr8O2NdH4YRO3ILXgv2LM9lKWlnvvDKwqFpWg09uZL/uIsorOiu8wc1hiy\n5IOTF2q/Dqu94u6cQGGO5g==\n-----END PRIVATE KEY-----\n';

var MANAGER_TOKENS_PROP_KEY = 'managerFcmTokens';

function getManagerTokens_() {
  var raw = PropertiesService.getScriptProperties().getProperty(MANAGER_TOKENS_PROP_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveManagerToken_(token) {
  if (!token) return;
  var tokens = getManagerTokens_();
  if (tokens.indexOf(token) === -1) {
    tokens.push(token);
    PropertiesService.getScriptProperties().setProperty(MANAGER_TOKENS_PROP_KEY, JSON.stringify(tokens));
  }
}

function removeManagerToken_(token) {
  var tokens = getManagerTokens_().filter(function(t){ return t !== token; });
  PropertiesService.getScriptProperties().setProperty(MANAGER_TOKENS_PROP_KEY, JSON.stringify(tokens));
}

function registerManagerToken_(body) {
  if (!body.token) return { ok: false, error: 'No token provided' };
  saveManagerToken_(body.token);
  return { ok: true };
}

// Signs a JWT with the service account's private key and exchanges it for a
// short-lived OAuth2 access token — this is what FCM's v1 send API requires
// instead of the old single "server key". Cached for ~55min since a fresh
// token is valid for 1hr and this is called on every new request.
function getFcmAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('fcm_access_token');
  if (cached) return cached;

  function b64url(bytesOrString) {
    return Utilities.base64EncodeWebSafe(bytesOrString).replace(/=+$/, '');
  }

  var header = { alg: 'RS256', typ: 'JWT' };
  var now = Math.floor(Date.now() / 1000);
  var claimSet = {
    iss: FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  var toSign = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claimSet));
  var signatureBytes = Utilities.computeRsaSha256Signature(toSign, FCM_PRIVATE_KEY);
  var jwt = toSign + '.' + b64url(signatureBytes);

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  var json = JSON.parse(response.getContentText());
  if (!json.access_token) {
    Logger.log('FCM OAuth token exchange failed: ' + response.getContentText());
    return null;
  }
  cache.put('fcm_access_token', json.access_token, json.expires_in - 60);
  return json.access_token;
}

// Pings every registered Manager device the moment a Caller submits a new
// (Pending) request. Best-effort — wrapped so a Firebase/network hiccup here
// never blocks the request itself from saving. A token that FCM reports as
// invalid/unregistered (device uninstalled, permission revoked, etc.) is
// pruned automatically.
// Sends any number of FCM push messages in ONE parallel batch (UrlFetchApp.
// fetchAll) instead of one UrlFetchApp.fetch() per token per recipient
// group. This matters because every notification send used to happen
// synchronously before the triggering request's HTTP response went back —
// a Caller waiting on "Submitted!" or a Manager waiting on "Approved!" was
// stuck behind however many sequential FCM calls (Manager + Admin, or
// Diesel Team + Admin) that event fanned out to. Batching them cuts that
// to roughly the time of the single slowest call.
// groups: [{ tokens: [...], title, body, link, onInvalid: fn(token) }, ...]
function sendPushBatch_(groups) {
  try {
    var accessToken = getFcmAccessToken_();
    if (!accessToken) return;

    var requests = [];
    var meta = [];
    groups.forEach(function(group) {
      (group.tokens || []).forEach(function(token) {
        requests.push({
          url: 'https://fcm.googleapis.com/v1/projects/' + FCM_PROJECT_ID + '/messages:send',
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + accessToken },
          payload: JSON.stringify({
            message: {
              token: token,
              notification: { title: group.title, body: group.body },
              webpush: { fcm_options: { link: group.link } }
            }
          }),
          muteHttpExceptions: true
        });
        meta.push({ token: token, onInvalid: group.onInvalid });
      });
    });
    if (!requests.length) return;

    var responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function(res, i) {
      var code = res.getResponseCode();
      if (code !== 200) {
        Logger.log('FCM send failed (' + code + '): ' + res.getContentText());
        if ((code === 404 || code === 400) && meta[i].onInvalid) meta[i].onInvalid(meta[i].token);
      }
    });
  } catch (err) {
    Logger.log('sendPushBatch_ error: ' + err.message);
  }
}

// ---------- Diesel Team push notifications (pinged when Manager approves) ----------
var DIESEL_TOKENS_PROP_KEY = 'dieselFcmTokens';

function getDieselTokens_() {
  var raw = PropertiesService.getScriptProperties().getProperty(DIESEL_TOKENS_PROP_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveDieselToken_(token) {
  if (!token) return;
  var tokens = getDieselTokens_();
  if (tokens.indexOf(token) === -1) {
    tokens.push(token);
    PropertiesService.getScriptProperties().setProperty(DIESEL_TOKENS_PROP_KEY, JSON.stringify(tokens));
  }
}

function removeDieselToken_(token) {
  var tokens = getDieselTokens_().filter(function(t){ return t !== token; });
  PropertiesService.getScriptProperties().setProperty(DIESEL_TOKENS_PROP_KEY, JSON.stringify(tokens));
}

function registerDieselToken_(body) {
  if (!body.token) return { ok: false, error: 'No token provided' };
  saveDieselToken_(body.token);
  return { ok: true };
}

// Pings every registered Diesel Team device the moment a Manager approves a
// request — that's their cue to go dispense it.
// ---------- Admin/Director push notifications (pinged on every new request AND every approval) ----------
var ADMIN_TOKENS_PROP_KEY = 'adminFcmTokens';

function getAdminTokens_() {
  var raw = PropertiesService.getScriptProperties().getProperty(ADMIN_TOKENS_PROP_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveAdminToken_(token) {
  if (!token) return;
  var tokens = getAdminTokens_();
  if (tokens.indexOf(token) === -1) {
    tokens.push(token);
    PropertiesService.getScriptProperties().setProperty(ADMIN_TOKENS_PROP_KEY, JSON.stringify(tokens));
  }
}

function removeAdminToken_(token) {
  var tokens = getAdminTokens_().filter(function(t){ return t !== token; });
  PropertiesService.getScriptProperties().setProperty(ADMIN_TOKENS_PROP_KEY, JSON.stringify(tokens));
}

function registerAdminToken_(body) {
  if (!body.token) return { ok: false, error: 'No token provided' };
  saveAdminToken_(body.token);
  return { ok: true };
}

// Generic (title/body supplied by the caller) since Admin is pinged for
// more than one kind of event — new request, approval, and potentially
// more later.
// Source sheet for the vehicle list — tab "Calling Sheet", Column C.
// NOTE: this used to be the "fleet s vehical" tab on a different spreadsheet
// (below, still kept as PUMP_SHEET_ID since pumps still read from there) —
// changed because that tab's Column C had gone empty.
var VEHICLE_SHEET_ID = '1wgG2K9phHMQPvIskvXF1OBHxNHFk8pegrKCi0hvuF6U';
var VEHICLE_SHEET_NAME = 'Calling Sheet';
var VEHICLE_COL = 3; // Column C

// Source sheet for the Driver ID -> Name/Mobile lookup
var DRIVER_SHEET_ID = '1wLY9CttPw-7FPP58aKLr0Ykf-Ok9uFg5B_kBGuWA-MA';
var DRIVER_SHEET_NAME = 'Driver Details';
var DRIVER_ID_COL = 1;     // Column A
var DRIVER_NAME_COL = 2;   // Column B
var DRIVER_MOBILE_COL = 3; // Column C

// Source sheet for the Pump/Location list — kept as its own hardcoded ID
// (was previously aliased to VEHICLE_SHEET_ID, which now points elsewhere).
var PUMP_SHEET_ID = '1EEks9zfIjnYKxARCN6nBTVTxboV19_i32Gg16BzGZdk';
var PUMP_SHEET_NAME = 'NEW DIESEL&UREA';
var PUMP_COL = 1; // Column A

// Source sheet for the Route/Trip list — Column C (From) + Column D (To)
var ROUTE_SHEET_ID = '1wgG2K9phHMQPvIskvXF1OBHxNHFk8pegrKCi0hvuF6U';
var ROUTE_SHEET_NAME = 'Routes';
var ROUTE_FROM_COL = 3; // Column C
var ROUTE_TO_COL = 4;   // Column D

// Attendance sheet: Vehicle No -> today's on-duty Driver ID/Name/Mobile.
// Layout: Col A=Sl No, B=Driver ID, C=Driver Name, D=Mobile, then a pair of
// columns per day of the month starting at E (Vehicle No that day, then
// TRUE/FALSE present). The tab is month-specific ("Attendance Oct", "Attendance Nov", ...)
// and is picked automatically from today's month by attendanceSheetName_().
var ATTENDANCE_SHEET_ID = '1wgG2K9phHMQPvIskvXF1OBHxNHFk8pegrKCi0hvuF6U';
function attendanceSheetName_() {
  return 'Attendance ' + Utilities.formatDate(new Date(), TIMEZONE, 'MMM');
}
var ATTENDANCE_ID_COL = 2;     // Column B
var ATTENDANCE_NAME_COL = 3;   // Column C
var ATTENDANCE_MOBILE_COL = 4; // Column D

var HEADERS = [
  'Request ID', 'Created At', 'Vehicle No', 'Driver ID', 'Driver Name',
  'Route / Trip', 'Pump / Location', 'Requested Liters', 'Requested By',
  'Contact Number', 'Calling Remarks', 'Status', 'Manager Name',
  'Approved Liters', 'Manager Remarks', 'OTP', 'Approved At', 'Dispensed By',
  'Actual Liters Dispensed', 'Dispensed At', 'Receipt No', 'Current Location', 'Odometer KM',
  'Rate Per Liter', 'Amount', 'Fuel Type', 'Before Refueling Photo', 'After Refueling Photo',
  'Caller Photo'
];

// Column numbers (1-indexed) — matches the HEADERS array
// NOTE: Always add a new field at the VERY END, never insert one in the
// middle — otherwise every existing row's data gets read from the wrong column.
var COL = {
  ID: 1, CREATED_AT: 2, VEHICLE: 3, DRIVER_ID: 4, DRIVER: 5, ROUTE: 6, PUMP: 7,
  REQ_LITERS: 8, REQ_BY: 9, CONTACT: 10, CALL_REMARKS: 11, STATUS: 12,
  MGR_NAME: 13, APPROVED_LITERS: 14, MGR_REMARKS: 15, OTP: 16,
  APPROVED_AT: 17, DISP_BY: 18, ACTUAL_LITERS: 19, DISP_AT: 20, RECEIPT: 21,
  CURRENT_LOCATION: 22, ODOMETER: 23, RATE_PER_LITER: 24, AMOUNT: 25,
  FUEL_TYPE: 26, BEFORE_PHOTO: 27, AFTER_PHOTO: 28, CALLER_PHOTO: 29
};

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    var p = (e && e.parameter) ? e.parameter : {};
    if (action === 'list') return jsonOut_(listRequests_(p.status || '', p.by || '', p.limit || '', p.source || ''));
    if (action === 'verify') return jsonOut_(checkApproved_(p.id));
    if (action === 'get') return jsonOut_(getRequest_(p.id));
    if (action === 'vehicles') return jsonOut_(listVehicles_());
    if (action === 'driver') return jsonOut_(lookupDriver_(p.id));
    if (action === 'vehicleDriver') return jsonOut_(lookupDriverByVehicleToday_(p.vehicle));
    if (action === 'pumps') return jsonOut_(listPumps_());
    if (action === 'routes') return jsonOut_(listRoutes_());
    if (action === 'history') return jsonOut_(vehicleHistory_(p.vehicle, p.limit || 5, p.fuelType || ''));
    // All three dropdown lists in a single round-trip (Apps Script takes ~2.5s
    // per call regardless of payload size, so fewer calls is the real speed win)
    if (action === 'lists') {
      var v = listVehicles_(), pu = listPumps_(), r = listRoutes_();
      return jsonOut_({
        ok: true,
        vehicles: v.ok ? v.vehicles : [],
        pumps: pu.ok ? pu.pumps : [],
        routes: r.ok ? r.routes : []
      });
    }
    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    if (action === 'create') return jsonOut_(createRequest_(body));
    if (action === 'createOffice') return jsonOut_(createOfficeRequest_(body));
    if (action === 'createCredit') return jsonOut_(createCreditRequest_(body));
    if (action === 'createBackDate') return jsonOut_(createBackDateRequest_(body));
    if (action === 'approve') return jsonOut_(approveRequest_(body));
    if (action === 'reject') return jsonOut_(rejectRequest_(body));
    if (action === 'dispense') return jsonOut_(dispenseRequest_(body));
    if (action === 'clearAllData') return jsonOut_(clearAllData_(body));
    if (action === 'deleteRequest') return jsonOut_(deleteRequestRow_(body));
    if (action === 'registerManagerToken') return jsonOut_(registerManagerToken_(body));
    if (action === 'registerDieselToken') return jsonOut_(registerDieselToken_(body));
    if (action === 'registerAdminToken') return jsonOut_(registerAdminToken_(body));
    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  ensureColumns_(sheet);
  return sheet;
}

// Every read/write here spans HEADERS.length columns; a sheet whose grid is
// narrower than that (e.g. right after a new column is appended to HEADERS)
// would throw "out of bounds" on the very next list/get call — so widen the
// grid on demand instead of relying on someone remembering to.
function ensureColumns_(sheet) {
  var have = sheet.getMaxColumns();
  if (have < HEADERS.length) sheet.insertColumnsAfter(have, HEADERS.length - have);
}

// Office Pump/Tanker Distribution Form's own tab — same column layout as
// "Requests" (reuses HEADERS/COL), kept separate per the user's request so
// office/tanker fills don't mix into the main Requests sheet.
function getOfficeSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(OFFICE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(OFFICE_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    // Office/Tanker skips the approval stage entirely — the OTP column is
    // never used here, so hide it (not deleted, to keep the same column
    // layout/indices as "Requests" — just out of sight).
    sheet.hideColumns(COL.OTP);
  }
  ensureColumns_(sheet);
  return sheet;
}

// Credit Diesel entries live on their own tab — same column layout (reuses
// HEADERS/COL), created straight in "Credit" status with no Manager/Diesel
// Team workflow attached, so nothing about how listRequests_' source param
// works needs to change for the other two sheets to stay blind to it.
function getCreditSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CREDIT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CREDIT_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  ensureColumns_(sheet);
  return sheet;
}

// Which sheet a Request ID lives in, based on its "OT"/"CR" vs "DSL" prefix.
function sheetForId_(id) {
  var s = String(id || '');
  if (/^OT/i.test(s)) return getOfficeSheet_();
  if (/^CR/i.test(s)) return getCreditSheet_();
  return getSheet_();
}

// A receipt number is "RCPT-yyMMdd-HHmmss" stamped in TIMEZONE at the exact
// moment of dispense, so it can stand in for a "Dispensed At" cell that is
// empty (the cell has been found blank on dozens of Dispensed rows while the
// receipt stayed intact). Returns '' if it can't be parsed.
function dispenseTimeFromReceipt_(receiptNo) {
  var m = String(receiptNo || '').match(/^RCPT-(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return '';
  var istOffsetMs = 5.5 * 60 * 60 * 1000; // TIMEZONE is Asia/Kolkata (no DST)
  return new Date(Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6])) - istOffsetMs);
}

// Newest-first comparator that tolerates blank/invalid timestamps: a row with
// no usable time counts as "newest" (so a fresh request can't sink out of
// sight) and ties keep their incoming order — plain Date subtraction gave NaN
// for these rows, which scrambles Array.sort.
function newestFirstByCreated_(a, b) {
  var ta = new Date(a.createdAt || a.approvedAt || a.dispensedAt).getTime();
  var tb = new Date(b.createdAt || b.approvedAt || b.dispensedAt).getTime();
  if (isNaN(ta)) ta = Infinity;
  if (isNaN(tb)) tb = Infinity;
  if (ta === tb) return 0;
  return tb - ta;
}

function rowToObj_(row) {
  var dispensedAt = row[COL.DISP_AT - 1];
  if (!dispensedAt && row[COL.STATUS - 1] === 'Dispensed') {
    dispensedAt = dispenseTimeFromReceipt_(row[COL.RECEIPT - 1]);
  }
  return {
    id: row[COL.ID - 1],
    createdAt: row[COL.CREATED_AT - 1],
    vehicleNo: row[COL.VEHICLE - 1],
    driverId: row[COL.DRIVER_ID - 1],
    driverName: row[COL.DRIVER - 1],
    routeTrip: row[COL.ROUTE - 1],
    currentLocation: row[COL.CURRENT_LOCATION - 1],
    odometerKm: row[COL.ODOMETER - 1],
    pumpLocation: row[COL.PUMP - 1],
    requestedLiters: row[COL.REQ_LITERS - 1],
    requestedBy: row[COL.REQ_BY - 1],
    contactNumber: row[COL.CONTACT - 1],
    callingRemarks: row[COL.CALL_REMARKS - 1],
    status: row[COL.STATUS - 1],
    managerName: row[COL.MGR_NAME - 1],
    approvedLiters: row[COL.APPROVED_LITERS - 1],
    managerRemarks: row[COL.MGR_REMARKS - 1],
    approvedAt: row[COL.APPROVED_AT - 1],
    dispensedBy: row[COL.DISP_BY - 1],
    actualLiters: row[COL.ACTUAL_LITERS - 1],
    dispensedAt: dispensedAt,
    receiptNo: row[COL.RECEIPT - 1],
    ratePerLiter: row[COL.RATE_PER_LITER - 1],
    amount: row[COL.AMOUNT - 1],
    fuelType: row[COL.FUEL_TYPE - 1] || 'Diesel',
    beforePhoto: row[COL.BEFORE_PHOTO - 1] || '',
    afterPhoto: row[COL.AFTER_PHOTO - 1] || '',
    callerPhoto: row[COL.CALLER_PHOTO - 1] || ''
    // NOTE: OTP is deliberately not returned here (in list/get) — security
  };
}

// status — only rows with this status ('' = all)
// by     — only rows with this "Requested By" name ('' = all)
// limit  — max rows to send back ('' = all)
// source — which sheet(s) to read:
//            ''       -> "Requests" only (default — Manager's view; Office/
//                        Tanker requests skip Manager entirely, so they
//                        must never show up there)
//            'office' -> "Office-Tanker" only (the Office form's own
//                        "My Requests" section)
//            'all'    -> both, merged (Director Overview, Diesel Team's list)
function listRequests_(status, by, limit, source) {
  var rows;
  if (source === 'office') {
    rows = readRequestRows_(getOfficeSheet_(), status, by);
  } else if (source === 'credit') {
    rows = readRequestRows_(getCreditSheet_(), status, by);
  } else if (source === 'all') {
    // Credit Diesel now goes to the Diesel Team like any other request, so it
    // is part of the merged view (still its own sheet, still has its own
    // source='credit' view for the Admin's Credit Diesel window).
    rows = readRequestRows_(getSheet_(), status, by)
      .concat(readRequestRows_(getOfficeSheet_(), status, by))
      .concat(readRequestRows_(getCreditSheet_(), status, by));
  } else {
    rows = readRequestRows_(getSheet_(), status, by);
  }
  rows.sort(newestFirstByCreated_);
  var max = Number(limit) || 0;
  if (max && rows.length > max) rows = rows.slice(0, max);
  return { ok: true, rows: rows };
}

function readRequestRows_(sheet, status, by) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var byNorm = String(by || '').trim().toUpperCase();
  var rows = [];
  for (var i = data.length - 1; i >= 0; i--) { // newest first
    var r = data[i];
    if (!r[COL.ID - 1]) continue;
    if (status && String(r[COL.STATUS - 1]) !== status) continue;
    if (byNorm && String(r[COL.REQ_BY - 1] || '').trim().toUpperCase() !== byNorm) continue;
    rows.push(rowToObj_(r));
  }
  return rows;
}

// Last N dispensed entries for a vehicle — for the calling/office form's
// refuel history. Merges both sheets, since a vehicle can be fueled via
// either form. Filtered/trimmed on the server instead of downloading
// the whole list.
function vehicleHistory_(vehicle, limit, fuelType) {
  if (!vehicle) return { ok: false, error: 'Provide a Vehicle No' };
  var target = String(vehicle).trim().toUpperCase();
  var max = Number(limit) || 5;
  var rows = readVehicleHistoryRows_(getSheet_(), target, fuelType)
    .concat(readVehicleHistoryRows_(getOfficeSheet_(), target, fuelType))
    .concat(readCreditHistoryRows_(target, fuelType));
  // Row order != dispense order (an older request can still be dispensed later),
  // so we sort by actual dispense time before taking the latest N. A row with a
  // missing/corrupt dispensedAt (e.g. a manually-edited sheet cell) sorts to the
  // bottom instead of NaN-comparing its way to the top.
  rows.sort(function(a, b){
    var ta = new Date(a.dispensedAt).getTime();
    var tb = new Date(b.dispensedAt).getTime();
    if (isNaN(ta)) ta = -Infinity;
    if (isNaN(tb)) tb = -Infinity;
    return tb - ta;
  });
  return { ok: true, rows: rows.slice(0, max) };
}

// Credit Diesel history: rows made before the Diesel Team step existed carry
// status "Credit" (the logged date stands in for a dispense time); newer ones
// are dispensed like any other request and appear once status is "Dispensed".
// Each row is tagged isCredit so the frontend shows a "CR" marker.
function readCreditHistoryRows_(target, fuelType) {
  var sheet = getCreditSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (!r[COL.ID - 1]) continue;
    var st = String(r[COL.STATUS - 1]);
    if (st !== 'Credit' && st !== 'Dispensed') continue;
    if (String(r[COL.VEHICLE - 1] || '').trim().toUpperCase() !== target) continue;
    if (fuelType && String(r[COL.FUEL_TYPE - 1] || 'Diesel') !== fuelType) continue;
    var dispensed = st === 'Dispensed';
    rows.push({
      dispensedAt: dispensed ? (r[COL.DISP_AT - 1] || dispenseTimeFromReceipt_(r[COL.RECEIPT - 1])) : r[COL.CREATED_AT - 1],
      actualLiters: dispensed ? r[COL.ACTUAL_LITERS - 1] : r[COL.REQ_LITERS - 1],
      odometerKm: r[COL.ODOMETER - 1],
      driverName: r[COL.DRIVER - 1],
      ratePerLiter: dispensed ? r[COL.RATE_PER_LITER - 1] : '',
      amount: dispensed ? r[COL.AMOUNT - 1] : '',
      isCredit: true
    });
  }
  return rows;
}

// fuelType — optional ('Diesel'/'Urea'); when given, only rows of that fuel
// type are returned (the Office form's history box switches with its tab, so
// picking Urea shouldn't show a Diesel fill and vice versa). Empty = no filter,
// used by the Diesel-only forms (calling-form, diesel-dispense).
function readVehicleHistoryRows_(sheet, target, fuelType) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (!r[COL.ID - 1]) continue;
    if (String(r[COL.STATUS - 1]) !== 'Dispensed') continue;
    if (String(r[COL.VEHICLE - 1] || '').trim().toUpperCase() !== target) continue;
    if (fuelType && String(r[COL.FUEL_TYPE - 1] || 'Diesel') !== fuelType) continue;
    // A Back Date request records a fill from an earlier day, so its history row
    // shows the date the caller picked (Created At), not the day it was dispensed.
    var isBackDate = /^BACKD/i.test(String(r[COL.ID - 1]));
    rows.push({
      dispensedAt: isBackDate ? r[COL.CREATED_AT - 1] : (r[COL.DISP_AT - 1] || dispenseTimeFromReceipt_(r[COL.RECEIPT - 1])),
      actualLiters: r[COL.ACTUAL_LITERS - 1],
      odometerKm: r[COL.ODOMETER - 1],
      driverName: r[COL.DRIVER - 1],
      ratePerLiter: r[COL.RATE_PER_LITER - 1],
      amount: r[COL.AMOUNT - 1],
      isBackDate: isBackDate
    });
  }
  return rows;
}

function getRequest_(id) {
  var found = findRow_(id);
  if (!found) return { ok: false, error: 'Request ID not found' };
  return { ok: true, row: rowToObj_(found.values) };
}

// Routes to the correct sheet (Requests vs Office-Tanker) based on the ID's
// prefix — returned `sheet` MUST be used for any write against this row,
// never a fresh getSheet_(), or the write lands in the wrong tab entirely.
// Two-pass lookup: scan only the ID column (1 col x N rows) to find the row,
// then read just that one row's full width. As the sheet has grown past 1000+
// rows, reading all HEADERS.length columns for every row just to find one by
// ID (the old approach) got noticeably slower on every approve/reject/dispense/
// delete/get call — this keeps the cost flat regardless of sheet size.
function findRow_(id) {
  var sheet = sheetForId_(id);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      var rowIndex = i + 2;
      var values = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
      return { rowIndex: rowIndex, values: values, sheet: sheet };
    }
  }
  return null;
}

// Next sequence number = (highest existing DSL### found in the sheet) + 1.
// NOT row-count-based on purpose: if someone manually deletes a row (e.g.
// cleaning up a test entry), a row-count-based scheme would reuse an ID
// that's still sitting in a later row, producing duplicates. Scanning for
// the actual max used number is immune to gaps from manual deletions.
function nextRequestSeq_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var ids = sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  var maxSeq = 0;
  for (var i = 0; i < ids.length; i++) {
    var m = String(ids[i][0] || '').match(/^DSL(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return maxSeq + 1;
}

function createRequest_(body) {
  var early = dupRequestId_(body);
  if (early) return { ok: true, requestId: early, duplicate: true };
  // Optional photo from the Calling form. Uploaded BEFORE taking the lock —
  // the Drive upload takes a couple of seconds and callers submit all day, so
  // holding the sheet lock for it would queue everyone else behind each
  // photo. (Named by vehicle + time since the request ID isn't known yet.)
  var callerPhotoUrl = '';
  if (body.callerPhoto) {
    var safeVehicle = String(body.vehicleNo || 'vehicle').replace(/[^A-Za-z0-9_-]/g, '');
    callerPhotoUrl = uploadPhotoFromDataUrl_(body.callerPhoto,
      'caller_' + safeVehicle + '_' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss'));
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var id;
  try {
    var dup = dupRequestId_(body);
    if (dup) return { ok: true, requestId: dup, duplicate: true };
    var sheet = getSheet_();
    var nextRow = sheet.getLastRow() + 1;
    var seq = nextRequestSeq_(sheet);
    id = 'DSL' + pad_(seq, 3);
    var now = new Date();

    var row = [];
    row[COL.ID - 1] = id;
    row[COL.CREATED_AT - 1] = now;
    row[COL.VEHICLE - 1] = body.vehicleNo || '';
    row[COL.DRIVER_ID - 1] = body.driverId || '';
    row[COL.DRIVER - 1] = body.driverName || '';
    row[COL.ROUTE - 1] = body.routeTrip || '';
    row[COL.CURRENT_LOCATION - 1] = body.currentLocation || '';
    row[COL.ODOMETER - 1] = Number(body.odometerKm) || 0;
    row[COL.PUMP - 1] = body.pumpLocation || '';
    // "Full" (Full Tank checkbox on the Calling form) is kept as text, not
    // coerced to a number — the Manager sets the actual approved liters.
    row[COL.REQ_LITERS - 1] = (String(body.requestedLiters || '').trim().toLowerCase() === 'full')
      ? 'Full' : (Number(body.requestedLiters) || 0);
    row[COL.REQ_BY - 1] = body.requestedBy || '';
    row[COL.CONTACT - 1] = body.contactNumber || '';
    row[COL.CALL_REMARKS - 1] = body.callingRemarks || '';
    row[COL.STATUS - 1] = 'Pending';
    row[COL.FUEL_TYPE - 1] = 'Diesel';
    row[COL.CALLER_PHOTO - 1] = callerPhotoUrl;

    if (callerPhotoUrl) {
      // Plain-text BEFORE writing so Sheets doesn't turn the Drive link into a
      // Smart Chip (see createOfficeRequest_), and self-heal the header cell
      // so nobody has to run a one-time utility for this new column.
      sheet.getRange(nextRow, COL.CALLER_PHOTO).setNumberFormat('@');
      var hdrCell = sheet.getRange(1, COL.CALLER_PHOTO);
      if (!hdrCell.getValue()) hdrCell.setValue('Caller Photo');
    }

    sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([fillEmpty_(row)]);
    SpreadsheetApp.flush(); // make sure this write is visible before the lock releases
    rememberClientId_(body, id);
  } finally {
    lock.releaseLock();
  }
  // Outside the lock — this is a network call (JWT sign + OAuth + FCM send),
  // no need to hold the sheet lock for it. Manager + Admin sent as ONE batch
  // (see sendPushBatch_) instead of two sequential calls, so the caller's
  // "Submitted!" response isn't waiting behind both.
  var newReqBody = (body.vehicleNo || 'Vehicle') + ' — requested by ' + (body.requestedBy || 'Calling Team') + ' (' + id + ')';
  sendPushBatch_([
    { tokens: getManagerTokens_(), title: '🆕 New Diesel Request', body: newReqBody, link: 'https://diesel-form.vercel.app/manager-approval.html', onInvalid: removeManagerToken_ },
    { tokens: getAdminTokens_(), title: '🆕 New Diesel Request', body: newReqBody, link: 'https://diesel-form.vercel.app/index.html', onInvalid: removeAdminToken_ }
  ]);
  return { ok: true, requestId: id };
}

// Same idea as nextRequestSeq_() but scans for the highest CR### used.
function nextCreditRequestSeq_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var ids = sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  var maxSeq = 0;
  for (var i = 0; i < ids.length; i++) {
    var m = String(ids[i][0] || '').match(/^CR(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return maxSeq + 1;
}

// Calling form's "Credit Diesel" checkbox — a credit-diesel fill that skips the
// Manager: it lands on its own "Credit Diesel" tab (CR### IDs) already
// "Approved", so the Diesel Team dispenses it like any other request.
function createCreditRequest_(body) {
  var early = dupRequestId_(body);
  if (early) return { ok: true, requestId: early, duplicate: true };
  var callerPhotoUrl = '';
  if (body.callerPhoto) {
    var safeVehicle = String(body.vehicleNo || 'vehicle').replace(/[^A-Za-z0-9_-]/g, '');
    callerPhotoUrl = uploadPhotoFromDataUrl_(body.callerPhoto,
      'credit_' + safeVehicle + '_' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss'));
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var id;
  try {
    var dup = dupRequestId_(body);
    if (dup) return { ok: true, requestId: dup, duplicate: true };
    var sheet = getCreditSheet_();
    var nextRow = sheet.getLastRow() + 1;
    var seq = nextCreditRequestSeq_(sheet);
    id = 'CR' + pad_(seq, 3);
    var now = new Date();

    var row = [];
    row[COL.ID - 1] = id;
    row[COL.CREATED_AT - 1] = now;
    row[COL.VEHICLE - 1] = body.vehicleNo || '';
    row[COL.DRIVER_ID - 1] = body.driverId || '';
    row[COL.DRIVER - 1] = body.driverName || '';
    row[COL.ROUTE - 1] = body.routeTrip || '';
    row[COL.CURRENT_LOCATION - 1] = body.currentLocation || '';
    row[COL.ODOMETER - 1] = Number(body.odometerKm) || 0;
    // "Full" stays as text — there is no Manager to fix a quantity, so the
    // Diesel Team enters the real liters when dispensing (see dispenseRequest_).
    var liters = (String(body.requestedLiters || '').trim().toLowerCase() === 'full')
      ? 'Full' : (Number(body.requestedLiters) || 0);
    row[COL.REQ_LITERS - 1] = liters;
    row[COL.REQ_BY - 1] = body.requestedBy || '';
    row[COL.CONTACT - 1] = body.contactNumber || '';
    row[COL.CALL_REMARKS - 1] = body.callingRemarks || '';
    // Skips the Manager like Office/Tanker does: written straight in as
    // "Approved" (Approved Liters = requested) so it is in the Diesel Team's
    // ready-to-dispense list right away. It stays on the Credit Diesel sheet
    // (CR### IDs) so Admin can still see all credit entries together.
    row[COL.STATUS - 1] = 'Approved';
    row[COL.MGR_NAME - 1] = 'Credit Diesel (direct)';
    row[COL.APPROVED_LITERS - 1] = liters;
    row[COL.APPROVED_AT - 1] = now;
    row[COL.FUEL_TYPE - 1] = 'Diesel';
    row[COL.CALLER_PHOTO - 1] = callerPhotoUrl;

    if (callerPhotoUrl) {
      sheet.getRange(nextRow, COL.CALLER_PHOTO).setNumberFormat('@');
      var hdrCell = sheet.getRange(1, COL.CALLER_PHOTO);
      if (!hdrCell.getValue()) hdrCell.setValue('Caller Photo');
    }

    sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([fillEmpty_(row)]);
    SpreadsheetApp.flush();
    rememberClientId_(body, id);
  } finally {
    lock.releaseLock();
  }
  var creditBody = (body.vehicleNo || 'Vehicle') + ' — ' + (String(body.requestedLiters || '').trim().toLowerCase() === 'full' ? 'Full tank' : (Number(body.requestedLiters) || 0) + 'L') + ' credit diesel by ' + (body.requestedBy || 'Calling Team') + ' (' + id + ')';
  sendPushBatch_([
    { tokens: getDieselTokens_(), title: '💳 Credit Diesel — Ready to Dispense', body: creditBody, link: 'https://diesel-form.vercel.app/diesel-dispense.html', onInvalid: removeDieselToken_ },
    { tokens: getAdminTokens_(), title: '💳 New Credit Diesel', body: creditBody, link: 'https://diesel-form.vercel.app/index.html', onInvalid: removeAdminToken_ }
  ]);
  return { ok: true, requestId: id };
}

// Calling form's "Back Date" mode - a normal request (Manager -> Diesel Team) for a
// fill from an earlier date: same "Requests" tab and workflow, but the ID is
// BACKD### and "Created At" carries the date the caller picked (with the current
// time of day, so same-day entries still sort).
function createBackDateRequest_(body) {
  var early = dupRequestId_(body);
  if (early) return { ok: true, requestId: early, duplicate: true };

  var picked = String(body.backDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(picked)) return { ok: false, error: 'Pick a valid Back Date.' };
  var todayStr = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  if (picked > todayStr) return { ok: false, error: 'Back Date cannot be in the future.' };
  if (picked < '2020-01-01') return { ok: false, error: 'Back Date is too old.' };
  var createdAt = Utilities.parseDate(picked + ' ' + Utilities.formatDate(new Date(), TIMEZONE, 'HH:mm:ss'),
    TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  var callerPhotoUrl = '';
  if (body.callerPhoto) {
    var safeVehicle = String(body.vehicleNo || 'vehicle').replace(/[^A-Za-z0-9_-]/g, '');
    callerPhotoUrl = uploadPhotoFromDataUrl_(body.callerPhoto,
      'backdate_' + safeVehicle + '_' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss'));
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var id;
  try {
    var dup = dupRequestId_(body);
    if (dup) return { ok: true, requestId: dup, duplicate: true };
    var sheet = getSheet_();
    var nextRow = sheet.getLastRow() + 1;
    id = 'BACKD' + pad_(nextBackDateSeq_(sheet), 3);

    var row = [];
    row[COL.ID - 1] = id;
    row[COL.CREATED_AT - 1] = createdAt;
    row[COL.VEHICLE - 1] = body.vehicleNo || '';
    row[COL.DRIVER_ID - 1] = body.driverId || '';
    row[COL.DRIVER - 1] = body.driverName || '';
    row[COL.ROUTE - 1] = body.routeTrip || '';
    row[COL.CURRENT_LOCATION - 1] = body.currentLocation || '';
    row[COL.ODOMETER - 1] = Number(body.odometerKm) || 0;
    row[COL.REQ_LITERS - 1] = (String(body.requestedLiters || '').trim().toLowerCase() === 'full')
      ? 'Full' : (Number(body.requestedLiters) || 0);
    row[COL.REQ_BY - 1] = body.requestedBy || '';
    row[COL.CONTACT - 1] = body.contactNumber || '';
    row[COL.CALL_REMARKS - 1] = body.callingRemarks || '';
    row[COL.STATUS - 1] = 'Pending';
    row[COL.FUEL_TYPE - 1] = 'Diesel';
    row[COL.CALLER_PHOTO - 1] = callerPhotoUrl;

    if (callerPhotoUrl) {
      sheet.getRange(nextRow, COL.CALLER_PHOTO).setNumberFormat('@');
      var hdrCell = sheet.getRange(1, COL.CALLER_PHOTO);
      if (!hdrCell.getValue()) hdrCell.setValue('Caller Photo');
    }

    sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([fillEmpty_(row)]);
    SpreadsheetApp.flush();
    rememberClientId_(body, id);
  } finally {
    lock.releaseLock();
  }
  var bdBody = (body.vehicleNo || 'Vehicle') + ' — back-dated request by ' + (body.requestedBy || 'Calling Team') + ' (' + id + ')';
  sendPushBatch_([
    { tokens: getManagerTokens_(), title: '🆕 New Diesel Request (Back Date)', body: bdBody, link: 'https://diesel-form.vercel.app/manager-approval.html', onInvalid: removeManagerToken_ },
    { tokens: getAdminTokens_(), title: '🆕 New Diesel Request (Back Date)', body: bdBody, link: 'https://diesel-form.vercel.app/index.html', onInvalid: removeAdminToken_ }
  ]);
  return { ok: true, requestId: id };
}

function nextBackDateSeq_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var ids = sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  var maxSeq = 0;
  for (var i = 0; i < ids.length; i++) {
    var m = String(ids[i][0] || '').match(/^BACKD(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return maxSeq + 1;
}

// Same idea as nextRequestSeq_() but scans for the highest OT### used.
function nextOfficeRequestSeq_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var ids = sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues();
  var maxSeq = 0;
  for (var i = 0; i < ids.length; i++) {
    var m = String(ids[i][0] || '').match(/^OT(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return maxSeq + 1;
}

// Drive folder that holds Before/After refueling photos from the Office
// Pump/Tanker form. Looked up by name (not a hardcoded ID) so it's created
// automatically the first time a photo is uploaded.
var PHOTO_FOLDER_NAME = 'Diesel Office-Tanker Refueling Photos';
function getPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

// dataUrl looks like "data:image/jpeg;base64,...." (built client-side after
// resizing/compressing the photo). Returns a Drive thumbnail-endpoint URL —
// NOTE: plain "uc?export=view" links open fine when navigated to directly,
// but Drive blocks them when loaded as an <img> subresource (confirmed by
// testing — naturalWidth/Height come back 0). The "thumbnail" endpoint is
// the one Drive actually serves reliably for embedding, so both the Diesel
// Team's <img> thumbnails and a click-through to view it full-size use this
// same URL. Returns '' if no photo was provided. Wrapped so a Drive/sharing
// hiccup never blocks the rest of the submission — the request still saves,
// just without that photo's link.
function uploadPhotoFromDataUrl_(dataUrl, filename) {
  if (!dataUrl) return '';
  try {
    var m = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return '';
    var mimeType = m[1];
    var ext = mimeType.split('/')[1] || 'jpg';
    var bytes = Utilities.base64Decode(m[2]);
    var blob = Utilities.newBlob(bytes, mimeType, filename + '.' + ext);
    var file = getPhotoFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w2000';
  } catch (err) {
    Logger.log('Photo upload failed for ' + filename + ': ' + err.message);
    return '';
  }
}

// Office Pump/Tanker Distribution Form's submit handler. Unlike createRequest_,
// this skips the Manager stage entirely — the row is written straight in as
// "Approved" (Approved Liters = the liters filled) so it shows up right away
// in the Diesel Team's ready-to-dispense list.
function createOfficeRequest_(body) {
  var early = dupRequestId_(body);
  if (early) return { ok: true, requestId: early, duplicate: true };

  // Drive uploads take seconds each — done BEFORE taking the sheet lock (named
  // by vehicle + time since the request ID isn't known yet) so other people's
  // submits don't queue behind this request's two photos.
  var safeVehicle = String(body.vehicleNo || 'vehicle').replace(/[^A-Za-z0-9_-]/g, '');
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss');
  var beforePhotoUrl = uploadPhotoFromDataUrl_(body.beforePhoto, 'office_' + safeVehicle + '_' + stamp + '_before');
  var afterPhotoUrl = uploadPhotoFromDataUrl_(body.afterPhoto, 'office_' + safeVehicle + '_' + stamp + '_after');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dup = dupRequestId_(body);
    if (dup) return { ok: true, requestId: dup, duplicate: true };
    var sheet = getOfficeSheet_();
    var nextRow = sheet.getLastRow() + 1;
    var seq = nextOfficeRequestSeq_(sheet);
    var id = 'OT' + pad_(seq, 3);
    var now = new Date();
    var liters = Number(body.requestedLiters) || 0;

    var row = [];
    row[COL.ID - 1] = id;
    row[COL.CREATED_AT - 1] = now;
    row[COL.VEHICLE - 1] = body.vehicleNo || '';
    row[COL.DRIVER_ID - 1] = body.driverId || '';
    row[COL.DRIVER - 1] = body.driverName || '';
    row[COL.ROUTE - 1] = body.routeTrip || '';
    row[COL.CURRENT_LOCATION - 1] = body.currentLocation || '';
    row[COL.ODOMETER - 1] = Number(body.odometerKm) || 0;
    row[COL.PUMP - 1] = body.pumpLocation || '';
    row[COL.REQ_LITERS - 1] = liters;
    row[COL.REQ_BY - 1] = body.requestedBy || '';
    row[COL.CONTACT - 1] = body.contactNumber || '';
    row[COL.CALL_REMARKS - 1] = body.callingRemarks || '';
    row[COL.STATUS - 1] = 'Approved';
    row[COL.MGR_NAME - 1] = 'Office/Tanker (direct)';
    row[COL.APPROVED_LITERS - 1] = liters;
    row[COL.APPROVED_AT - 1] = now;
    row[COL.FUEL_TYPE - 1] = (body.fuelType === 'Urea') ? 'Urea' : 'Diesel';
    row[COL.BEFORE_PHOTO - 1] = beforePhotoUrl;
    row[COL.AFTER_PHOTO - 1] = afterPhotoUrl;

    // Plain-text format BEFORE writing — otherwise Sheets silently auto-
    // converts a recognized Drive link into a "Smart Chip", and getValues()
    // then returns the chip's display name (e.g. "OT001_before.png")
    // instead of the URL, breaking every reader of this column.
    sheet.getRange(nextRow, COL.BEFORE_PHOTO, 1, 2).setNumberFormat('@');
    sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([fillEmpty_(row)]);
    SpreadsheetApp.flush();
    rememberClientId_(body, id);
    return { ok: true, requestId: id };
  } finally {
    lock.releaseLock();
  }
}

function approveRequest_(body) {
  if (/^OT/i.test(body.id || '')) {
    return { ok: false, error: 'Office/Tanker requests go straight to the Diesel Team — no manager approval needed.' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var vehicleNo, approvedLiters, managerName;
  try {
    var found = findRow_(body.id);
    if (!found) return { ok: false, error: 'Request ID not found' };
    if (found.values[COL.STATUS - 1] !== 'Pending') {
      return { ok: false, error: 'This request is already "' + found.values[COL.STATUS - 1] + '"' };
    }
    var sheet = found.sheet;
    var values = found.values;

    // The Manager can edit and overwrite these (vehicle/driver/route/pump/liters)
    if (body.vehicleNo) values[COL.VEHICLE - 1] = body.vehicleNo;
    if (body.driverId) values[COL.DRIVER_ID - 1] = body.driverId;
    if (body.driverName) values[COL.DRIVER - 1] = body.driverName;
    if (body.routeTrip) values[COL.ROUTE - 1] = body.routeTrip;
    if (body.pumpLocation) values[COL.PUMP - 1] = body.pumpLocation;

    values[COL.STATUS - 1] = 'Approved';
    values[COL.MGR_NAME - 1] = body.managerName || '';
    values[COL.APPROVED_LITERS - 1] = Number(body.approvedLiters) || 0;
    values[COL.MGR_REMARKS - 1] = body.managerRemarks || '';
    // Column P (OTP) is left blank on purpose — no longer auto-generated,
    // filled in manually if ever needed.
    values[COL.APPROVED_AT - 1] = new Date();

    // One write for the whole row instead of up to 9 separate setValue calls —
    // each Range.setValue() is its own round trip into the Sheets service.
    sheet.getRange(found.rowIndex, 1, 1, HEADERS.length).setValues([values]);

    vehicleNo = values[COL.VEHICLE - 1];
    approvedLiters = Number(body.approvedLiters) || 0;
    managerName = body.managerName || '';
  } finally {
    lock.releaseLock();
  }
  // Outside the lock — network calls, no need to hold the sheet lock for
  // them. Diesel Team + Admin sent as ONE batch (see sendPushBatch_) instead
  // of two sequential calls, so the Manager's "Approved!" response isn't
  // waiting behind both.
  var approvedBody = vehicleNo + ' — ' + approvedLiters + 'L approved (' + body.id + ')';
  sendPushBatch_([
    { tokens: getDieselTokens_(), title: '✅ Ready to Dispense', body: approvedBody, link: 'https://diesel-form.vercel.app/diesel-dispense.html', onInvalid: removeDieselToken_ },
    { tokens: getAdminTokens_(), title: '✅ Request Approved', body: vehicleNo + ' — ' + approvedLiters + 'L approved by ' + (managerName || 'Manager') + ' (' + body.id + ')', link: 'https://diesel-form.vercel.app/index.html', onInvalid: removeAdminToken_ }
  ]);
  return { ok: true, requestId: body.id };
}

function rejectRequest_(body) {
  if (/^OT/i.test(body.id || '')) {
    return { ok: false, error: 'Office/Tanker requests go straight to the Diesel Team — nothing to reject here.' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findRow_(body.id);
    if (!found) return { ok: false, error: 'Request ID not found' };
    if (found.values[COL.STATUS - 1] !== 'Pending') {
      return { ok: false, error: 'This request is already "' + found.values[COL.STATUS - 1] + '"' };
    }
    var sheet = found.sheet;
    var values = found.values;
    values[COL.STATUS - 1] = 'Rejected';
    values[COL.MGR_NAME - 1] = body.managerName || '';
    values[COL.MGR_REMARKS - 1] = body.managerRemarks || '';
    values[COL.APPROVED_AT - 1] = new Date();
    sheet.getRange(found.rowIndex, 1, 1, HEADERS.length).setValues([values]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// NOTE: The OTP check was deliberately removed (per user request) — now just
// having status "Approved" is enough to dispense; OTP is no longer verified.
function checkApproved_(id) {
  var found = findRow_(id);
  if (!found) return { ok: false, error: 'Request ID not found' };
  if (found.values[COL.STATUS - 1] === 'Dispensed') {
    return { ok: false, error: 'This diesel has already been dispensed' };
  }
  if (found.values[COL.STATUS - 1] !== 'Approved') {
    return { ok: false, error: 'This request is not "Approved" yet (status: ' + found.values[COL.STATUS - 1] + ')' };
  }
  return { ok: true, row: rowToObj_(found.values) };
}

function dispenseRequest_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Inlined status check (instead of calling checkApproved_, which does its
    // own findRow_) plus reusing the already-updated in-memory row for the
    // return value (instead of re-reading the sheet a third time) — this used
    // to cost 3 findRow_ calls + 7 separate setValue calls per dispense.
    var found = findRow_(body.id);
    if (!found) return { ok: false, error: 'Request ID not found' };
    if (found.values[COL.STATUS - 1] === 'Dispensed') {
      return { ok: false, error: 'This diesel has already been dispensed' };
    }
    if (found.values[COL.STATUS - 1] !== 'Approved') {
      return { ok: false, error: 'This request is not "Approved" yet (status: ' + found.values[COL.STATUS - 1] + ')' };
    }

    var sheet = found.sheet;
    var values = found.values;
    var receiptNo = 'RCPT-' + Utilities.formatDate(new Date(), TIMEZONE, 'yyMMdd-HHmmss');

    // Actual liters = Approved Liters (manager-fixed quantity) — the diesel team
    // only enters rate/liter now, not the liters again. Amount is calculated on
    // the server (not trusting the client) to prevent tampering.
    var actualLiters = Number(values[COL.APPROVED_LITERS - 1]) || 0;
    // Credit Diesel has no Manager to fix the quantity, so the Diesel Team
    // enters the liters actually filled (other requests ignore body.actualLiters).
    if (/^CR/i.test(String(body.id || ''))) {
      actualLiters = Number(body.actualLiters) || 0;
      if (actualLiters <= 0) return { ok: false, error: 'Enter the Liters dispensed for this Credit Diesel entry.' };
      values[COL.APPROVED_LITERS - 1] = actualLiters;
    }
    var ratePerLiter = Number(body.ratePerLiter) || 0;
    var amount = Math.round(ratePerLiter * actualLiters * 100) / 100;

    values[COL.STATUS - 1] = 'Dispensed';
    values[COL.DISP_BY - 1] = body.dispensedBy || '';
    values[COL.ACTUAL_LITERS - 1] = actualLiters;
    values[COL.DISP_AT - 1] = new Date();
    values[COL.RECEIPT - 1] = receiptNo;
    values[COL.RATE_PER_LITER - 1] = ratePerLiter;
    values[COL.AMOUNT - 1] = amount;
    if (body.pumpLocation) values[COL.PUMP - 1] = body.pumpLocation;

    sheet.getRange(found.rowIndex, 1, 1, HEADERS.length).setValues([values]);

    var receipt = rowToObj_(values);
    return { ok: true, receipt: receipt };
  } finally {
    lock.releaseLock();
  }
}

function listVehicles_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('vehicle_list');
  if (cached) return { ok: true, vehicles: JSON.parse(cached) };

  var ss = SpreadsheetApp.openById(VEHICLE_SHEET_ID);
  var sheet = findSheetLoose_(ss, VEHICLE_SHEET_NAME);
  if (!sheet) {
    var names = ss.getSheets().map(function(s){ return s.getName(); });
    return { ok: false, error: '"' + VEHICLE_SHEET_NAME + '" tab not found. This sheet\'s tabs: ' + names.join(', ') };
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, vehicles: [] };

  var values = sheet.getRange(2, VEHICLE_COL, lastRow - 1, 1).getValues();
  var seen = {};
  var vehicles = [];
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i][0] || '').trim();
    if (v && !seen[v]) { seen[v] = true; vehicles.push(v); }
  }
  vehicles.sort();

  cache.put('vehicle_list', JSON.stringify(vehicles), 21600); // 6 hour cache (vehicle list rarely changes; speeds up form load)
  return { ok: true, vehicles: vehicles };
}

function listPumps_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('pump_list');
  if (cached) return { ok: true, pumps: JSON.parse(cached) };

  var ss = SpreadsheetApp.openById(PUMP_SHEET_ID);
  var sheet = findSheetLoose_(ss, PUMP_SHEET_NAME);
  if (!sheet) {
    var names = ss.getSheets().map(function(s){ return s.getName(); });
    return { ok: false, error: '"' + PUMP_SHEET_NAME + '" tab not found. This sheet\'s tabs: ' + names.join(', ') };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, pumps: [] };

  var values = sheet.getRange(2, PUMP_COL, lastRow - 1, 1).getValues();
  var seen = {};
  var pumps = [];
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i][0] || '').trim();
    if (v && !seen[v]) { seen[v] = true; pumps.push(v); }
  }
  pumps.sort();

  cache.put('pump_list', JSON.stringify(pumps), 21600); // 6 hour cache
  return { ok: true, pumps: pumps };
}

function listRoutes_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('route_list');
  if (cached) return { ok: true, routes: JSON.parse(cached) };

  var ss = SpreadsheetApp.openById(ROUTE_SHEET_ID);
  var sheet = findSheetLoose_(ss, ROUTE_SHEET_NAME);
  if (!sheet) {
    var names = ss.getSheets().map(function(s){ return s.getName(); });
    return { ok: false, error: '"' + ROUTE_SHEET_NAME + '" tab not found. This sheet\'s tabs: ' + names.join(', ') };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, routes: [] };

  var lastCol = Math.max(ROUTE_FROM_COL, ROUTE_TO_COL);
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var seen = {};
  var routes = [];
  for (var i = 0; i < values.length; i++) {
    var from = String(values[i][ROUTE_FROM_COL - 1] || '').trim();
    var to = String(values[i][ROUTE_TO_COL - 1] || '').trim();
    if (!from || !to) continue;
    var route = from + ' to ' + to;
    if (!seen[route]) { seen[route] = true; routes.push(route); }
  }
  routes.sort();

  cache.put('route_list', JSON.stringify(routes), 21600); // 6 hour cache
  return { ok: true, routes: routes };
}

function lookupDriver_(id) {
  if (!id) return { ok: false, error: 'Provide a Driver ID' };
  var target = String(id).trim().toLowerCase();

  var ss = SpreadsheetApp.openById(DRIVER_SHEET_ID);
  var sheet = ss.getSheetByName(DRIVER_SHEET_NAME);
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      for (var i = 0; i < data.length; i++) {
        var rowId = String(data[i][DRIVER_ID_COL - 1] || '').trim().toLowerCase();
        if (rowId === target) {
          return {
            ok: true,
            driverId: data[i][DRIVER_ID_COL - 1],
            name: String(data[i][DRIVER_NAME_COL - 1] || '').trim(),
            mobile: String(data[i][DRIVER_MOBILE_COL - 1] || '').trim()
          };
        }
      }
    }
  }

  // Fallback: a driver sometimes shows up in Attendance before anyone gets
  // around to adding them to Driver Details — same ID/Name/Mobile columns
  // exist there too, so check it before giving up.
  var fromAttendance = lookupDriverInAttendance_(target);
  if (fromAttendance) return fromAttendance;

  return { ok: false, error: 'Driver ID not found' };
}

function lookupDriverInAttendance_(targetLower) {
  var ss = SpreadsheetApp.openById(ATTENDANCE_SHEET_ID);
  var sheet = findSheetLoose_(ss, attendanceSheetName_());
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, ATTENDANCE_MOBILE_COL).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowId = String(data[i][ATTENDANCE_ID_COL - 1] || '').trim().toLowerCase();
    if (rowId === targetLower) {
      return {
        ok: true,
        driverId: data[i][ATTENDANCE_ID_COL - 1],
        name: String(data[i][ATTENDANCE_NAME_COL - 1] || '').trim(),
        mobile: String(data[i][ATTENDANCE_MOBILE_COL - 1] || '').trim()
      };
    }
  }
  return null;
}

// Vehicle No -> today's assigned driver, from the Attendance sheet. Matches
// whichever driver is assigned to this vehicle in today's date column,
// present or absent (attendance TRUE/FALSE is not checked).
// Result is cached for 10 minutes (keyed by today's date) since the whole
// sheet only needs re-reading once per day in practice.
function lookupDriverByVehicleToday_(vehicle) {
  if (!vehicle) return { ok: false, error: 'Provide a Vehicle No' };
  var target = String(vehicle).trim().toUpperCase();

  var cache = CacheService.getScriptCache();
  var todayKey = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var cacheKey = 'attmap2_' + todayKey;
  var map;
  var cached = cache.get(cacheKey);
  if (cached) {
    map = JSON.parse(cached);
  } else {
    map = buildTodayAttendanceMap_();
    try { cache.put(cacheKey, JSON.stringify(map), 600); } catch (e) {} // 10 min
  }

  var entry = map[target];
  if (!entry) return { ok: false, error: 'No driver assigned to this vehicle today in Attendance sheet' };
  return { ok: true, driverId: entry.driverId, name: entry.name, mobile: entry.mobile };
}

function buildTodayAttendanceMap_() {
  var map = {};
  var ss = SpreadsheetApp.openById(ATTENDANCE_SHEET_ID);
  var sheet = findSheetLoose_(ss, attendanceSheetName_());
  if (!sheet) return map;

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastCol < 1 || lastRow < 2) return map;

  var todayStr = Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy');
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var vehicleCol = -1;
  for (var c = 0; c < header.length; c++) {
    var h = header[c];
    var hStr = (h instanceof Date) ? Utilities.formatDate(h, TIMEZONE, 'dd/MM/yyyy') : String(h || '').trim();
    if (hStr === todayStr) { vehicleCol = c; break; }
  }
  if (vehicleCol === -1) return map; // today's date column isn't in this sheet (e.g. wrong month's tab)

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var driverId = String(row[ATTENDANCE_ID_COL - 1] || '').trim();
    if (!driverId) continue;
    var vehicleForToday = String(row[vehicleCol] || '').trim().toUpperCase();
    if (!vehicleForToday) continue;
    // Match on vehicle assignment alone — present or absent, whichever
    // driver is assigned to this vehicle today per the sheet still counts.
    map[vehicleForToday] = {
      driverId: driverId,
      name: String(row[ATTENDANCE_NAME_COL - 1] || '').trim(),
      mobile: String(row[ATTENDANCE_MOBILE_COL - 1] || '').trim()
    };
  }
  return map;
}

// Tries an exact match first, then a loose match ignoring case/extra spaces
function findSheetLoose_(ss, name) {
  var exact = ss.getSheetByName(name);
  if (exact) return exact;
  var target = String(name).trim().toUpperCase().replace(/\s+/g, '');
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var candidate = sheets[i].getName().trim().toUpperCase().replace(/\s+/g, '');
    if (candidate === target) return sheets[i];
  }
  return null;
}

function pad_(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

// Idempotency for create calls: a form on a weak network may re-send a submit
// whose first attempt actually reached the server but whose reply was lost.
// Each submit carries a clientId; the ID it produced is remembered for 6h so a
// re-send returns the same request instead of creating a duplicate row.
function dupRequestId_(body) {
  if (!body || !body.clientId) return '';
  return CacheService.getScriptCache().get('cid_' + String(body.clientId).slice(0, 64)) || '';
}
function rememberClientId_(body, id) {
  if (!body || !body.clientId) return;
  try { CacheService.getScriptCache().put('cid_' + String(body.clientId).slice(0, 64), id, 21600); } catch (e) {}
}

function fillEmpty_(row) {
  for (var i = 0; i < HEADERS.length; i++) {
    if (row[i] === undefined) row[i] = '';
  }
  return row;
}

/**********************************************************************
 * TO CLEAR ALL DATA (manual use only)
 *
 * This function is deliberately NOT exposed in doGet/doPost — meaning
 * nothing outside (via URL) can trigger it. Runs only from the Apps
 * Script editor.
 *
 * HOW TO RUN:
 *   1. Open the Apps Script editor
 *   2. Select "resetAllRequests" from the function dropdown at the top
 *   3. Click "Run" (▶)
 *   4. The execution log will show "Deleted X test rows"
 *
 * Every row is copied into the "Archive" tab first (tagged "manual editor
 * run"), so nothing is actually lost — it's just moved out of "Requests".
 * The next request will start again from DSL001.
 *********************************************************************/
function resetAllRequests() {
  var count = archiveAndClearSheet_(getSheet_(), 'manual editor run');
  count += archiveAndClearSheet_(getOfficeSheet_(), 'manual editor run');
  if (count === 0) {
    Logger.log('Both sheets are already empty — nothing to delete.');
    return;
  }
  Logger.log('Archived + deleted ' + count + ' rows total (Requests + Office-Tanker). Next requests start at DSL001 / OT001.');
}

// Shared by resetAllRequests()/clearAllData_(): archives every row in the
// given sheet, then deletes them. Returns how many rows were cleared.
function archiveAndClearSheet_(sheet, clearedBy) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  archiveRequests_(sheet, clearedBy);
  var count = lastRow - 1;
  sheet.deleteRows(2, count);
  return count;
}

/**********************************************************************
 * ONE-TIME FIX: rename duplicate Request IDs (manual use only)
 *
 * If a row was ever manually deleted from "Requests", the old row-count-
 * based ID generation could reuse an ID that a later row still had,
 * producing two rows with the same Request ID. Run this once to fix it:
 * for each duplicate, the FIRST (earliest, topmost) row keeps its ID —
 * every later row with that same ID gets renamed to the next free DSL###
 * number. Safe to run any time; does nothing if there are no duplicates.
 *
 * HOW TO RUN: Apps Script editor > function dropdown > "fixDuplicateRequestIds"
 * > Run (▶) > check the execution log for what got renamed.
 *********************************************************************/
function fixDuplicateRequestIds() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('No data.'); return; }

  var idRange = sheet.getRange(2, COL.ID, lastRow - 1, 1);
  var ids = idRange.getValues();
  var seen = {};
  var renamed = [];
  var nextSeq = null;

  for (var i = 0; i < ids.length; i++) {
    var idStr = String(ids[i][0] || '').trim();
    if (!idStr) continue;
    if (!seen[idStr]) {
      seen[idStr] = true;
      continue;
    }
    if (nextSeq === null) nextSeq = nextRequestSeq_(sheet);
    var newId = 'DSL' + pad_(nextSeq, 3);
    nextSeq++;
    sheet.getRange(i + 2, COL.ID).setValue(newId);
    renamed.push(idStr + ' -> ' + newId + ' (row ' + (i + 2) + ')');
  }

  Logger.log(renamed.length ? 'Renamed duplicate IDs:\n' + renamed.join('\n') : 'No duplicate IDs found.');
}

/**********************************************************************
 * ONE-TIME: hide the unused OTP column on an Office-Tanker sheet that
 * already existed before this hide-on-create logic was added.
 * HOW TO RUN: Apps Script editor > function dropdown > "hideOfficeOtpColumn"
 * > Run (▶). Safe to run more than once.
 *********************************************************************/
function hideOfficeOtpColumn() {
  var sheet = getOfficeSheet_(); // creates the tab if it doesn't exist yet
  sheet.hideColumns(COL.OTP);
  Logger.log('Column ' + COL.OTP + ' (OTP) hidden on the "' + OFFICE_SHEET_NAME + '" tab.');
}

// One-time utility — run once (Apps Script editor -> select this function ->
// Run) after adding "Fuel Type" to HEADERS/COL. Writes the new header cell
// to both existing sheets (their header row was already written before this
// column existed, so it won't pick it up on its own) and backfills 'Diesel'
// into every existing row, since all requests were diesel before the Urea
// option existed on the Office/Tanker form.
function addFuelTypeColumn() {
  [getSheet_(), getOfficeSheet_()].forEach(function(sheet) {
    sheet.getRange(1, COL.FUEL_TYPE).setValue('Fuel Type');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var range = sheet.getRange(2, COL.FUEL_TYPE, lastRow - 1, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      if (!values[i][0]) { values[i][0] = 'Diesel'; changed = true; }
    }
    if (changed) range.setValues(values);
  });
  Logger.log('Fuel Type column added/backfilled on both sheets.');
}

// One-time utility — run once after adding the Before/After Refueling Photo
// columns to HEADERS/COL. Just writes the two header cells (no backfill
// needed — old rows never had photos, so blank is the correct value there).
function addPhotoColumns() {
  [getSheet_(), getOfficeSheet_()].forEach(function(sheet) {
    sheet.getRange(1, COL.BEFORE_PHOTO).setValue('Before Refueling Photo');
    sheet.getRange(1, COL.AFTER_PHOTO).setValue('After Refueling Photo');
    // Whole-column plain-text format so Sheets never auto-chips a Drive
    // link written into these columns (see the comment in
    // createOfficeRequest_ for why that silently breaks getValues()).
    // NOTE: must be two single-column calls — Sheets rejects a full-height
    // format spanning more than one column at once ("Please make a
    // selection within a single column to perform column level actions").
    sheet.getRange(1, COL.BEFORE_PHOTO, sheet.getMaxRows(), 1).setNumberFormat('@');
    sheet.getRange(1, COL.AFTER_PHOTO, sheet.getMaxRows(), 1).setNumberFormat('@');
  });
  Logger.log('Photo columns added to both sheets.');
}

// One-time utility — run once if the vehicle-suggestion dropdown still shows
// nothing right after switching VEHICLE_SHEET_ID/NAME to a new source. Not
// normally needed (listVehicles_ never caches a truly empty result), but
// covers the case where a previous empty read got cached before the switch.
function clearVehicleListCache() {
  CacheService.getScriptCache().remove('vehicle_list');
  Logger.log('Vehicle list cache cleared — next load will read fresh from the sheet.');
}

var ARCHIVE_SHEET_NAME = 'Archive';

// Copies every current row from "Requests" into the "Archive" tab (creating it
// with headers on first use) before a clear, tagging each row with who cleared
// it and when — so cleared data is never actually gone, just moved out of the
// active view. The Developer/Director can open the Archive tab any time to
// browse everything that's ever been cleared.
function archiveRequests_(sheet, clearedBy) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var archive = ss.getSheetByName(ARCHIVE_SHEET_NAME);
  if (!archive) {
    archive = ss.insertSheet(ARCHIVE_SHEET_NAME);
    archive.getRange(1, 1, 1, HEADERS.length + 2).setValues([HEADERS.concat(['Cleared At', 'Cleared By'])]);
    archive.setFrozenRows(1);
  }

  var now = new Date();
  var rows = data.map(function(row){ return row.concat([now, clearedBy || 'unknown']); });
  archive.getRange(archive.getLastRow() + 1, 1, rows.length, HEADERS.length + 2).setValues(rows);
  return rows.length;
}

// Password-gated version of resetAllRequests_(), reachable via the web app
// (action=clearAllData) — used by the "Clear All Data" button on index.html,
// visible only to whoever is logged into that page (Director/Developer).
// The password is checked here on the server, not just in the browser, so
// calling this action directly (bypassing the UI) still requires it.
function clearAllData_(body) {
  if (!body.password || body.password !== ADMIN_RESET_PASSWORD) {
    return { ok: false, error: 'Incorrect password' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var count = archiveAndClearSheet_(getSheet_(), body.clearedBy);
    count += archiveAndClearSheet_(getOfficeSheet_(), body.clearedBy);
    Logger.log('All data cleared via web app by "' + (body.clearedBy || 'unknown') + '". Archived + deleted ' + count + ' rows total (Requests + Office-Tanker). Next requests start at DSL001 / OT001.');
    return { ok: true, deletedCount: count };
  } finally {
    lock.releaseLock();
  }
}

// Deletes a single request row directly, no archive — used by the
// Director/Admin panel's per-row "✕" delete button. Requires the delete
// password, checked here on the server (not just in the browser) so
// calling this action directly still requires it.
function deleteRequestRow_(body) {
  if (!body.id) return { ok: false, error: 'Provide a Request ID' };
  if (!body.password || body.password !== DELETE_REQUEST_PASSWORD) {
    return { ok: false, error: 'Incorrect password' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findRow_(body.id);
    if (!found) return { ok: false, error: 'Request ID not found' };
    found.sheet.deleteRow(found.rowIndex);
    Logger.log('Request ' + body.id + ' deleted via web app.');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// One-time repair (run manually from the Apps Script editor): fills every empty
// "Dispensed At" cell on Dispensed rows from the row's receipt number. Touches
// only that one column and only cells that are currently blank.
function backfillDispensedAt() {
  var fixed = 0;
  [getSheet_(), getOfficeSheet_()].forEach(function(sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var range = sheet.getRange(2, COL.DISP_AT, lastRow - 1, 1);
    var disp = range.getValues();
    var meta = sheet.getRange(2, COL.STATUS, lastRow - 1, COL.RECEIPT - COL.STATUS + 1).getValues();
    var changed = false;
    for (var i = 0; i < disp.length; i++) {
      if (disp[i][0]) continue;
      if (meta[i][0] !== 'Dispensed') continue;
      var t = dispenseTimeFromReceipt_(meta[i][COL.RECEIPT - COL.STATUS]);
      if (!t) continue;
      disp[i][0] = t;
      fixed++;
      changed = true;
    }
    if (changed) range.setValues(disp);
  });
  Logger.log('Backfilled ' + fixed + ' Dispensed At cells');
}

// One-time repair (run manually from the Apps Script editor): refills empty
// "Created At" cells on the Requests sheet using the upload time of the row's
// Caller Photo — the photo is uploaded in the same call that creates the row,
// so Drive's file creation time is accurate to a few seconds. Only blank
// Created At cells on rows that have a photo are written.
function backfillCreatedAt() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var created = sheet.getRange(2, COL.CREATED_AT, lastRow - 1, 1).getValues();
  var photos = sheet.getRange(2, COL.CALLER_PHOTO, lastRow - 1, 1).getValues();
  var fixed = 0, changed = false;
  for (var i = 0; i < created.length; i++) {
    if (created[i][0]) continue;
    var m = String(photos[i][0] || '').match(/[?&]id=([^&]+)/);
    if (!m) continue;
    try {
      created[i][0] = DriveApp.getFileById(m[1]).getDateCreated();
      fixed++;
      changed = true;
    } catch (e) { /* file deleted or not accessible — leave blank */ }
  }
  if (changed) sheet.getRange(2, COL.CREATED_AT, lastRow - 1, 1).setValues(created);
  Logger.log('Backfilled ' + fixed + ' Created At cells');
}
