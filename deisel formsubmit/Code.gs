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
function sendManagerNotification_(id, vehicleNo, requestedBy) {
  try {
    var tokens = getManagerTokens_();
    if (!tokens.length) return;
    var accessToken = getFcmAccessToken_();
    if (!accessToken) return;

    var title = '🆕 New Diesel Request';
    var body = (vehicleNo || 'Vehicle') + ' — requested by ' + (requestedBy || 'Calling Team') + ' (' + id + ')';

    tokens.forEach(function(token) {
      var message = {
        message: {
          token: token,
          notification: { title: title, body: body },
          webpush: { fcm_options: { link: 'https://diesel-form.vercel.app/manager-approval.html' } }
        }
      };
      var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + FCM_PROJECT_ID + '/messages:send', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + accessToken },
        payload: JSON.stringify(message),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code !== 200) {
        Logger.log('FCM send failed (' + code + '): ' + res.getContentText());
        if (code === 404 || code === 400) removeManagerToken_(token);
      }
    });
  } catch (err) {
    Logger.log('sendManagerNotification_ error: ' + err.message);
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
function sendDieselNotification_(id, vehicleNo, approvedLiters) {
  try {
    var tokens = getDieselTokens_();
    if (!tokens.length) return;
    var accessToken = getFcmAccessToken_();
    if (!accessToken) return;

    var title = '✅ Ready to Dispense';
    var body = (vehicleNo || 'Vehicle') + ' — ' + approvedLiters + 'L approved (' + id + ')';

    tokens.forEach(function(token) {
      var message = {
        message: {
          token: token,
          notification: { title: title, body: body },
          webpush: { fcm_options: { link: 'https://diesel-form.vercel.app/diesel-dispense.html' } }
        }
      };
      var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + FCM_PROJECT_ID + '/messages:send', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + accessToken },
        payload: JSON.stringify(message),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code !== 200) {
        Logger.log('FCM send failed (' + code + '): ' + res.getContentText());
        if (code === 404 || code === 400) removeDieselToken_(token);
      }
    });
  } catch (err) {
    Logger.log('sendDieselNotification_ error: ' + err.message);
  }
}

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
function sendAdminNotification_(title, body, link) {
  try {
    var tokens = getAdminTokens_();
    if (!tokens.length) return;
    var accessToken = getFcmAccessToken_();
    if (!accessToken) return;

    tokens.forEach(function(token) {
      var message = {
        message: {
          token: token,
          notification: { title: title, body: body },
          webpush: { fcm_options: { link: link || 'https://diesel-form.vercel.app/index.html' } }
        }
      };
      var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + FCM_PROJECT_ID + '/messages:send', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + accessToken },
        payload: JSON.stringify(message),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code !== 200) {
        Logger.log('FCM send failed (' + code + '): ' + res.getContentText());
        if (code === 404 || code === 400) removeAdminToken_(token);
      }
    });
  } catch (err) {
    Logger.log('sendAdminNotification_ error: ' + err.message);
  }
}

// Source sheet for the vehicle list (Diesel Sheet), tab "fleet s vehical" — Column C
var VEHICLE_SHEET_ID = '1EEks9zfIjnYKxARCN6nBTVTxboV19_i32Gg16BzGZdk';
var VEHICLE_SHEET_NAME = 'fleet s vehical';
var VEHICLE_COL = 3; // Column C

// Source sheet for the Driver ID -> Name/Mobile lookup
var DRIVER_SHEET_ID = '1wLY9CttPw-7FPP58aKLr0Ykf-Ok9uFg5B_kBGuWA-MA';
var DRIVER_SHEET_NAME = 'Driver Details';
var DRIVER_ID_COL = 1;     // Column A
var DRIVER_NAME_COL = 2;   // Column B
var DRIVER_MOBILE_COL = 3; // Column C

// Source sheet for the Pump/Location list (same file as vehicle list) — Column A
var PUMP_SHEET_ID = VEHICLE_SHEET_ID;
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
// TRUE/FALSE present). NOTE: tab name is month-specific ("Attendance Sep") —
// update ATTENDANCE_SHEET_NAME each month, or this lookup silently finds nothing.
var ATTENDANCE_SHEET_ID = '1wgG2K9phHMQPvIskvXF1OBHxNHFk8pegrKCi0hvuF6U';
var ATTENDANCE_SHEET_NAME = 'Attendance Sep';
var ATTENDANCE_ID_COL = 2;     // Column B
var ATTENDANCE_NAME_COL = 3;   // Column C
var ATTENDANCE_MOBILE_COL = 4; // Column D

var HEADERS = [
  'Request ID', 'Created At', 'Vehicle No', 'Driver ID', 'Driver Name',
  'Route / Trip', 'Pump / Location', 'Requested Liters', 'Requested By',
  'Contact Number', 'Calling Remarks', 'Status', 'Manager Name',
  'Approved Liters', 'Manager Remarks', 'OTP', 'Approved At', 'Dispensed By',
  'Actual Liters Dispensed', 'Dispensed At', 'Receipt No', 'Current Location', 'Odometer KM',
  'Rate Per Liter', 'Amount', 'Fuel Type', 'Before Refueling Photo', 'After Refueling Photo'
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
  FUEL_TYPE: 26, BEFORE_PHOTO: 27, AFTER_PHOTO: 28
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
  return sheet;
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
  return sheet;
}

// Which sheet a Request ID lives in, based on its "OT" vs "DSL" prefix.
function sheetForId_(id) {
  return /^OT/i.test(String(id || '')) ? getOfficeSheet_() : getSheet_();
}

function rowToObj_(row) {
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
    dispensedAt: row[COL.DISP_AT - 1],
    receiptNo: row[COL.RECEIPT - 1],
    ratePerLiter: row[COL.RATE_PER_LITER - 1],
    amount: row[COL.AMOUNT - 1],
    fuelType: row[COL.FUEL_TYPE - 1] || 'Diesel',
    beforePhoto: row[COL.BEFORE_PHOTO - 1] || '',
    afterPhoto: row[COL.AFTER_PHOTO - 1] || ''
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
  } else if (source === 'all') {
    rows = readRequestRows_(getSheet_(), status, by).concat(readRequestRows_(getOfficeSheet_(), status, by));
  } else {
    rows = readRequestRows_(getSheet_(), status, by);
  }
  rows.sort(function(a, b){ return new Date(b.createdAt) - new Date(a.createdAt); }); // newest first
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
  var rows = readVehicleHistoryRows_(getSheet_(), target, fuelType).concat(readVehicleHistoryRows_(getOfficeSheet_(), target, fuelType));
  // Row order != dispense order (an older request can still be dispensed later),
  // so we sort by actual dispense time before taking the latest N.
  rows.sort(function(a, b){ return new Date(b.dispensedAt) - new Date(a.dispensedAt); });
  return { ok: true, rows: rows.slice(0, max) };
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
    rows.push({
      dispensedAt: r[COL.DISP_AT - 1],
      actualLiters: r[COL.ACTUAL_LITERS - 1],
      odometerKm: r[COL.ODOMETER - 1],
      driverName: r[COL.DRIVER - 1],
      ratePerLiter: r[COL.RATE_PER_LITER - 1],
      amount: r[COL.AMOUNT - 1]
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
function findRow_(id) {
  var sheet = sheetForId_(id);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][COL.ID - 1]) === String(id)) {
      return { rowIndex: i + 2, values: data[i], sheet: sheet };
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
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var id;
  try {
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
    row[COL.REQ_LITERS - 1] = Number(body.requestedLiters) || 0;
    row[COL.REQ_BY - 1] = body.requestedBy || '';
    row[COL.CONTACT - 1] = body.contactNumber || '';
    row[COL.CALL_REMARKS - 1] = body.callingRemarks || '';
    row[COL.STATUS - 1] = 'Pending';
    row[COL.FUEL_TYPE - 1] = 'Diesel';

    sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([fillEmpty_(row)]);
    SpreadsheetApp.flush(); // make sure this write is visible before the lock releases
  } finally {
    lock.releaseLock();
  }
  // Outside the lock — this is a network call (JWT sign + OAuth + FCM send),
  // no need to hold the sheet lock for it.
  sendManagerNotification_(id, body.vehicleNo, body.requestedBy);
  sendAdminNotification_('🆕 New Diesel Request', (body.vehicleNo || 'Vehicle') + ' — requested by ' + (body.requestedBy || 'Calling Team') + ' (' + id + ')', 'https://diesel-form.vercel.app/index.html');
  return { ok: true, requestId: id };
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
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getOfficeSheet_();
    var nextRow = sheet.getLastRow() + 1;
    var seq = nextOfficeRequestSeq_(sheet);
    var id = 'OT' + pad_(seq, 3);
    var now = new Date();
    var liters = Number(body.requestedLiters) || 0;
    var beforePhotoUrl = uploadPhotoFromDataUrl_(body.beforePhoto, id + '_before');
    var afterPhotoUrl = uploadPhotoFromDataUrl_(body.afterPhoto, id + '_after');

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

    // The Manager can edit and overwrite these (vehicle/driver/route/pump/liters)
    if (body.vehicleNo) sheet.getRange(found.rowIndex, COL.VEHICLE).setValue(body.vehicleNo);
    if (body.driverId) sheet.getRange(found.rowIndex, COL.DRIVER_ID).setValue(body.driverId);
    if (body.driverName) sheet.getRange(found.rowIndex, COL.DRIVER).setValue(body.driverName);
    if (body.routeTrip) sheet.getRange(found.rowIndex, COL.ROUTE).setValue(body.routeTrip);
    if (body.pumpLocation) sheet.getRange(found.rowIndex, COL.PUMP).setValue(body.pumpLocation);

    sheet.getRange(found.rowIndex, COL.STATUS).setValue('Approved');
    sheet.getRange(found.rowIndex, COL.MGR_NAME).setValue(body.managerName || '');
    sheet.getRange(found.rowIndex, COL.APPROVED_LITERS).setValue(Number(body.approvedLiters) || 0);
    sheet.getRange(found.rowIndex, COL.MGR_REMARKS).setValue(body.managerRemarks || '');
    // Column P (OTP) is left blank on purpose — no longer auto-generated,
    // filled in manually if ever needed.
    sheet.getRange(found.rowIndex, COL.APPROVED_AT).setValue(new Date());

    vehicleNo = body.vehicleNo || found.values[COL.VEHICLE - 1];
    approvedLiters = Number(body.approvedLiters) || 0;
    managerName = body.managerName || '';
  } finally {
    lock.releaseLock();
  }
  // Outside the lock — network calls, no need to hold the sheet lock for them.
  sendDieselNotification_(body.id, vehicleNo, approvedLiters);
  sendAdminNotification_('✅ Request Approved', vehicleNo + ' — ' + approvedLiters + 'L approved by ' + (managerName || 'Manager') + ' (' + body.id + ')', 'https://diesel-form.vercel.app/index.html');
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
    sheet.getRange(found.rowIndex, COL.STATUS).setValue('Rejected');
    sheet.getRange(found.rowIndex, COL.MGR_NAME).setValue(body.managerName || '');
    sheet.getRange(found.rowIndex, COL.MGR_REMARKS).setValue(body.managerRemarks || '');
    sheet.getRange(found.rowIndex, COL.APPROVED_AT).setValue(new Date());
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
    var check = checkApproved_(body.id);
    if (!check.ok) return check;

    var found = findRow_(body.id);
    var sheet = found.sheet;
    var receiptNo = 'RCPT-' + Utilities.formatDate(new Date(), TIMEZONE, 'yyMMdd-HHmmss');

    // Actual liters = Approved Liters (manager-fixed quantity) — the diesel team
    // only enters rate/liter now, not the liters again. Amount is calculated on
    // the server (not trusting the client) to prevent tampering.
    var actualLiters = Number(check.row.approvedLiters) || 0;
    var ratePerLiter = Number(body.ratePerLiter) || 0;
    var amount = Math.round(ratePerLiter * actualLiters * 100) / 100;

    sheet.getRange(found.rowIndex, COL.STATUS).setValue('Dispensed');
    sheet.getRange(found.rowIndex, COL.DISP_BY).setValue(body.dispensedBy || '');
    sheet.getRange(found.rowIndex, COL.ACTUAL_LITERS).setValue(actualLiters);
    sheet.getRange(found.rowIndex, COL.DISP_AT).setValue(new Date());
    sheet.getRange(found.rowIndex, COL.RECEIPT).setValue(receiptNo);
    sheet.getRange(found.rowIndex, COL.RATE_PER_LITER).setValue(ratePerLiter);
    sheet.getRange(found.rowIndex, COL.AMOUNT).setValue(amount);
    if (body.pumpLocation) sheet.getRange(found.rowIndex, COL.PUMP).setValue(body.pumpLocation);

    var updated = findRow_(body.id);
    var receipt = rowToObj_(updated.values);
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
  var sheet = findSheetLoose_(ss, ATTENDANCE_SHEET_NAME);
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
  var cacheKey = 'attmap_' + todayKey;
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
  var sheet = findSheetLoose_(ss, ATTENDANCE_SHEET_NAME);
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
