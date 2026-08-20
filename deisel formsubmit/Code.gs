/**********************************************************************
 * DIESEL APPROVAL SYSTEM — Google Apps Script Web App (backend)
 *
 * What it does: stores/updates the 3-stage workflow's data in a Google Sheet.
 *   Stage 1 (Calling Team)  -> create   -> new request, "Pending"
 *   Stage 2 (Manager)       -> approve/reject -> edit data and approve,
 *                               a 4-digit OTP is generated on approval
 *   Stage 3 (Diesel Team)   -> verify + dispense -> once the OTP matches,
 *                               "Dispensed" + a receipt number is generated
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
var TIMEZONE = 'Asia/Kolkata';

// Gate for the "Clear All Data" button on index.html (Director/Developer view only).
// Same password as that page's login — this is just a re-confirmation click-guard,
// not a separate secret to manage.
var ADMIN_RESET_PASSWORD = 'Daman@11';

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
// TRUE/FALSE present). NOTE: tab name is month-specific ("Attendance Aug") —
// update ATTENDANCE_SHEET_NAME each month, or this lookup silently finds nothing.
var ATTENDANCE_SHEET_ID = '1wgG2K9phHMQPvIskvXF1OBHxNHFk8pegrKCi0hvuF6U';
var ATTENDANCE_SHEET_NAME = 'Attendance Aug';
var ATTENDANCE_ID_COL = 2;     // Column B
var ATTENDANCE_NAME_COL = 3;   // Column C
var ATTENDANCE_MOBILE_COL = 4; // Column D

var HEADERS = [
  'Request ID', 'Created At', 'Vehicle No', 'Driver ID', 'Driver Name',
  'Route / Trip', 'Pump / Location', 'Requested Liters', 'Requested By',
  'Contact Number', 'Calling Remarks', 'Status', 'Manager Name',
  'Approved Liters', 'Manager Remarks', 'OTP', 'Approved At', 'Dispensed By',
  'Actual Liters Dispensed', 'Dispensed At', 'Receipt No', 'Current Location', 'Odometer KM',
  'Rate Per Liter', 'Amount'
];

// Column numbers (1-indexed) — matches the HEADERS array
// NOTE: Always add a new field at the VERY END, never insert one in the
// middle — otherwise every existing row's data gets read from the wrong column.
var COL = {
  ID: 1, CREATED_AT: 2, VEHICLE: 3, DRIVER_ID: 4, DRIVER: 5, ROUTE: 6, PUMP: 7,
  REQ_LITERS: 8, REQ_BY: 9, CONTACT: 10, CALL_REMARKS: 11, STATUS: 12,
  MGR_NAME: 13, APPROVED_LITERS: 14, MGR_REMARKS: 15, OTP: 16,
  APPROVED_AT: 17, DISP_BY: 18, ACTUAL_LITERS: 19, DISP_AT: 20, RECEIPT: 21,
  CURRENT_LOCATION: 22, ODOMETER: 23, RATE_PER_LITER: 24, AMOUNT: 25
};

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    var p = (e && e.parameter) ? e.parameter : {};
    if (action === 'list') return jsonOut_(listRequests_(p.status || '', p.by || '', p.limit || ''));
    if (action === 'verify') return jsonOut_(checkApproved_(p.id));
    if (action === 'get') return jsonOut_(getRequest_(p.id));
    if (action === 'vehicles') return jsonOut_(listVehicles_());
    if (action === 'driver') return jsonOut_(lookupDriver_(p.id));
    if (action === 'vehicleDriver') return jsonOut_(lookupDriverByVehicleToday_(p.vehicle));
    if (action === 'pumps') return jsonOut_(listPumps_());
    if (action === 'routes') return jsonOut_(listRoutes_());
    if (action === 'history') return jsonOut_(vehicleHistory_(p.vehicle, p.limit || 5));
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
    if (action === 'approve') return jsonOut_(approveRequest_(body));
    if (action === 'reject') return jsonOut_(rejectRequest_(body));
    if (action === 'dispense') return jsonOut_(dispenseRequest_(body));
    if (action === 'clearAllData') return jsonOut_(clearAllData_(body));
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
    amount: row[COL.AMOUNT - 1]
    // NOTE: OTP is deliberately not returned here (in list/get) — security
  };
}

// status  — only rows with this status ('' = all)
// by      — only rows with this "Requested By" name ('' = all)
// limit   — max rows to send back ('' = all). Filtering happens on the
//           server so the whole sheet doesn't need to be downloaded for large data.
function listRequests_(status, by, limit) {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var max = Number(limit) || 0;
  var byNorm = String(by || '').trim().toUpperCase();
  var rows = [];
  for (var i = data.length - 1; i >= 0; i--) { // newest first
    var r = data[i];
    if (!r[COL.ID - 1]) continue;
    if (status && String(r[COL.STATUS - 1]) !== status) continue;
    if (byNorm && String(r[COL.REQ_BY - 1] || '').trim().toUpperCase() !== byNorm) continue;
    rows.push(rowToObj_(r));
    if (max && rows.length >= max) break;
  }
  return { ok: true, rows: rows };
}

// Last N dispensed entries for a vehicle — for the calling form's refuel history.
// Filtered/trimmed on the server instead of downloading the whole list.
function vehicleHistory_(vehicle, limit) {
  if (!vehicle) return { ok: false, error: 'Provide a Vehicle No' };
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, rows: [] };
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var target = String(vehicle).trim().toUpperCase();
  var max = Number(limit) || 5;
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (!r[COL.ID - 1]) continue;
    if (String(r[COL.STATUS - 1]) !== 'Dispensed') continue;
    if (String(r[COL.VEHICLE - 1] || '').trim().toUpperCase() !== target) continue;
    rows.push({
      dispensedAt: r[COL.DISP_AT - 1],
      actualLiters: r[COL.ACTUAL_LITERS - 1],
      odometerKm: r[COL.ODOMETER - 1],
      driverName: r[COL.DRIVER - 1],
      ratePerLiter: r[COL.RATE_PER_LITER - 1],
      amount: r[COL.AMOUNT - 1]
    });
  }
  // Row order != dispense order (an older request can still be dispensed later),
  // so we sort by actual dispense time before taking the latest N.
  rows.sort(function(a, b){ return new Date(b.dispensedAt) - new Date(a.dispensedAt); });
  return { ok: true, rows: rows.slice(0, max) };
}

function getRequest_(id) {
  var found = findRow_(id);
  if (!found) return { ok: false, error: 'Request ID not found' };
  return { ok: true, row: rowToObj_(found.values) };
}

function findRow_(id) {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][COL.ID - 1]) === String(id)) {
      return { rowIndex: i + 2, values: data[i] };
    }
  }
  return null;
}

function createRequest_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet_();
    var nextRow = sheet.getLastRow() + 1;
    var seq = nextRow - 1; // header is row1
    var id = 'DSL' + pad_(seq, 3);
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

    sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([fillEmpty_(row)]);
    return { ok: true, requestId: id };
  } finally {
    lock.releaseLock();
  }
}

function approveRequest_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findRow_(body.id);
    if (!found) return { ok: false, error: 'Request ID not found' };
    if (found.values[COL.STATUS - 1] !== 'Pending') {
      return { ok: false, error: 'This request is already "' + found.values[COL.STATUS - 1] + '"' };
    }
    var sheet = getSheet_();
    var otp = String(Math.floor(1000 + Math.random() * 9000));

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
    sheet.getRange(found.rowIndex, COL.OTP).setValue(otp);
    sheet.getRange(found.rowIndex, COL.APPROVED_AT).setValue(new Date());

    return { ok: true, otp: otp, requestId: body.id };
  } finally {
    lock.releaseLock();
  }
}

function rejectRequest_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findRow_(body.id);
    if (!found) return { ok: false, error: 'Request ID not found' };
    if (found.values[COL.STATUS - 1] !== 'Pending') {
      return { ok: false, error: 'This request is already "' + found.values[COL.STATUS - 1] + '"' };
    }
    var sheet = getSheet_();
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
    return { ok: false, error: 'This request has not been "Approved" by the manager yet (status: ' + found.values[COL.STATUS - 1] + ')' };
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
    var sheet = getSheet_();
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

  var ss = SpreadsheetApp.openById(DRIVER_SHEET_ID);
  var sheet = ss.getSheetByName(DRIVER_SHEET_NAME);
  if (!sheet) return { ok: false, error: '"' + DRIVER_SHEET_NAME + '" tab not found' };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Driver ID not found' };

  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var target = String(id).trim().toLowerCase();
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
  return { ok: false, error: 'Driver ID not found' };
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
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Sheet is already empty — nothing to delete.');
    return;
  }
  archiveRequests_(sheet, 'manual editor run');
  var count = lastRow - 1;
  sheet.deleteRows(2, count);
  Logger.log('Archived + deleted ' + count + ' rows. The next request will start from DSL001.');
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
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, deletedCount: 0 };
    archiveRequests_(sheet, body.clearedBy);
    var count = lastRow - 1;
    sheet.deleteRows(2, count);
    Logger.log('All data cleared via web app by "' + (body.clearedBy || 'unknown') + '". Archived + deleted ' + count + ' rows. Next request starts at DSL001.');
    return { ok: true, deletedCount: count };
  } finally {
    lock.releaseLock();
  }
}
