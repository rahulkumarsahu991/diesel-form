/**********************************************************************
 * DIESEL APPROVAL SYSTEM — Google Apps Script Web App (backend)
 *
 * Kaam: 3 stage workflow ka data ek Google Sheet me store/update karta hai.
 *   Stage 1 (Calling Team)  -> create   -> naya request "Pending"
 *   Stage 2 (Manager)       -> approve/reject -> data edit karke approve,
 *                               approve hone par 4-digit OTP generate hota hai
 *   Stage 3 (Diesel Team)   -> verify + dispense -> OTP match hote hi
 *                               "Dispensed" + receipt number generate
 *
 * ===================  SETUP (ek hi baar)  ===========================
 * 1. Google Drive me nayi Google Sheet banao (naam: "Diesel Approval Data").
 * 2. Menu: Extensions > Apps Script
 * 3. Saara default code hata kar ye poora code paste karo.
 * 4. Save (disk icon / Ctrl+S).
 * 5. Deploy > New deployment > gear icon > type: "Web app"
 *      - Description: Diesel approval backend
 *      - Execute as:  Me  (tumhara account)
 *      - Who has access:  Anyone
 *    "Deploy" dabao, permissions allow karo (Advanced > Go to project > Allow).
 * 6. Jo "/exec" URL milega use copy karo — teeno HTML files (calling-form.html,
 *    manager-approval.html, diesel-dispense.html) me top par
 *    APPS_SCRIPT_URL = "" wali line me paste karo.
 *
 * NOTE: Agar baad me is code me change karo to "Deploy > Manage deployments"
 * se SAME deployment ko "Edit" karke naya version deploy karna — warna URL
 * badal jaayega aur HTML files me dubara paste karna padega.
 *
 * NOTE (vehicle/pump/route search + driver ID lookup): Ye script alag
 * Google Sheets se bhi data padhta hai (vehicle list, driver details,
 * pump/location list, aur route list). Wo sheets
 * isi Google account se open honi chahiye jisse ye script "Execute as: Me"
 * par deploy hai (ya kam se kam Viewer access ho). Pehli baar deploy/run
 * karte waqt Google ek extra permission popup dega ("See, edit... Google
 * Sheets") — Allow kar dena.
 *********************************************************************/

var SHEET_NAME = 'Requests';
var TIMEZONE = 'Asia/Kolkata';

// Vehicle list ke liye source sheet (Diesel Sheet), tab "fleet s vehical" — Column C
var VEHICLE_SHEET_ID = '1EEks9zfIjnYKxARCN6nBTVTxboV19_i32Gg16BzGZdk';
var VEHICLE_SHEET_NAME = 'fleet s vehical';
var VEHICLE_COL = 3; // Column C

// Driver ID -> Name/Mobile lookup ke liye source sheet
var DRIVER_SHEET_ID = '1wLY9CttPw-7FPP58aKLr0Ykf-Ok9uFg5B_kBGuWA-MA';
var DRIVER_SHEET_NAME = 'Driver Details';
var DRIVER_ID_COL = 1;     // Column A
var DRIVER_NAME_COL = 2;   // Column B
var DRIVER_MOBILE_COL = 3; // Column C

// Pump/Location list ke liye source sheet (same file as vehicle list) — Column A
var PUMP_SHEET_ID = VEHICLE_SHEET_ID;
var PUMP_SHEET_NAME = 'NEW DIESEL&UREA';
var PUMP_COL = 1; // Column A

// Route/Trip list ke liye source sheet — Column C (From) + Column D (To)
var ROUTE_SHEET_ID = '1wgG2K9phHMQPvIskvXF1OBHxNHFk8pegrKCi0hvuF6U';
var ROUTE_SHEET_NAME = 'Routes';
var ROUTE_FROM_COL = 3; // Column C
var ROUTE_TO_COL = 4;   // Column D

var HEADERS = [
  'Request ID', 'Created At', 'Vehicle No', 'Driver ID', 'Driver Name',
  'Route / Trip', 'Pump / Location', 'Requested Liters', 'Requested By',
  'Contact Number', 'Calling Remarks', 'Status', 'Manager Name',
  'Approved Liters', 'Manager Remarks', 'OTP', 'Approved At', 'Dispensed By',
  'Actual Liters Dispensed', 'Dispensed At', 'Receipt No', 'Current Location', 'Odometer KM',
  'Rate Per Liter', 'Amount'
];

// Column numbers (1-indexed) — HEADERS array se match
// NOTE: Naya field hamesha SABSE AAKHIR me add karna, kabhi beech me insert mat
// karna — warna saari purani rows ka data galat column se read hone lagega.
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
    if (action === 'pumps') return jsonOut_(listPumps_());
    if (action === 'routes') return jsonOut_(listRoutes_());
    if (action === 'history') return jsonOut_(vehicleHistory_(p.vehicle, p.limit || 5));
    // Ek hi round-trip me teeno dropdown lists (Apps Script har call par ~2.5s
    // leta hai chahe payload chhota ho, isliye calls kam karna hi asli speed hai)
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
    // NOTE: OTP jaan-boojh kar yahan return nahi hota (list/get me) — security
  };
}

// status  — sirf us status ki rows ('' = sab)
// by      — sirf us "Requested By" naam ki rows ('' = sab)
// limit   — max kitni rows bhejni ('' = sab). Filtering server par hoti hai
//           taaki bade data me poori sheet download na karni pade.
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

// Ek vehicle ki last N dispensed entries — calling form ki refuel history ke liye.
// Poori list download karne ke bajaye server par hi filter/trim ho jaata hai.
function vehicleHistory_(vehicle, limit) {
  if (!vehicle) return { ok: false, error: 'Vehicle No do' };
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
  // Row order != dispense order (ek purani request baad me bhi dispense ho sakti
  // hai), isliye actual dispense time par sort karke hi latest N nikalte hain.
  rows.sort(function(a, b){ return new Date(b.dispensedAt) - new Date(a.dispensedAt); });
  return { ok: true, rows: rows.slice(0, max) };
}

function getRequest_(id) {
  var found = findRow_(id);
  if (!found) return { ok: false, error: 'Request ID nahi mila' };
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
    if (!found) return { ok: false, error: 'Request ID nahi mila' };
    if (found.values[COL.STATUS - 1] !== 'Pending') {
      return { ok: false, error: 'Ye request pehle hi "' + found.values[COL.STATUS - 1] + '" ho chuki hai' };
    }
    var sheet = getSheet_();
    var otp = String(Math.floor(1000 + Math.random() * 9000));

    // Manager edit karke overwrite kar sakta hai (vehicle/driver/route/pump/liters)
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
    if (!found) return { ok: false, error: 'Request ID nahi mila' };
    if (found.values[COL.STATUS - 1] !== 'Pending') {
      return { ok: false, error: 'Ye request pehle hi "' + found.values[COL.STATUS - 1] + '" ho chuki hai' };
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

// NOTE: OTP check jaan-boojh kar hata diya gaya hai (user request) — ab sirf
// status "Approved" hona kaafi hai dispense karne ke liye, OTP verify nahi hota.
function checkApproved_(id) {
  var found = findRow_(id);
  if (!found) return { ok: false, error: 'Request ID nahi mila' };
  if (found.values[COL.STATUS - 1] === 'Dispensed') {
    return { ok: false, error: 'Ye diesel pehle hi dispense ho chuka hai' };
  }
  if (found.values[COL.STATUS - 1] !== 'Approved') {
    return { ok: false, error: 'Ye request abhi tak manager se "Approved" nahi hai (status: ' + found.values[COL.STATUS - 1] + ')' };
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

    // Actual liters = Approved Liters (manager-fixed quantity) — diesel team ab sirf
    // rate/liter daalta hai, liters dobara type nahi karta. Amount server par
    // calculate hota hai (client-trust nahi karte) taaki tampering na ho sake.
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
    return { ok: false, error: '"' + VEHICLE_SHEET_NAME + '" tab nahi mila. Is sheet ke tabs: ' + names.join(', ') };
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
    return { ok: false, error: '"' + PUMP_SHEET_NAME + '" tab nahi mila. Is sheet ke tabs: ' + names.join(', ') };
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
    return { ok: false, error: '"' + ROUTE_SHEET_NAME + '" tab nahi mila. Is sheet ke tabs: ' + names.join(', ') };
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
  if (!id) return { ok: false, error: 'Driver ID do' };

  var ss = SpreadsheetApp.openById(DRIVER_SHEET_ID);
  var sheet = ss.getSheetByName(DRIVER_SHEET_NAME);
  if (!sheet) return { ok: false, error: '"' + DRIVER_SHEET_NAME + '" tab nahi mila' };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Driver ID nahi mila' };

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
  return { ok: false, error: 'Driver ID nahi mila' };
}

// Exact match try karta hai, fir case/extra-space ignore karke loose match
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
 * SAARA DATA CLEAR KARNE KE LIYE (sirf manual use)
 *
 * Ye function jaan-boojh kar doGet/doPost me expose NAHI kiya gaya —
 * matlab isse koi bahar se (URL se) trigger nahi kar sakta. Sirf Apps
 * Script editor se hi chalega.
 *
 * KAISE CHALAYE:
 *   1. Apps Script editor kholo
 *   2. Upar function dropdown me "resetAllRequests" chuno
 *   3. "Run" (▶) dabao
 *   4. Execution log me "X test rows delete ho gayi" dikhega
 *
 * Isse "Requests" tab ki SAARI rows delete ho jaayengi (header safe
 * rahega) aur agli request dobara DSL001 se shuru hogi.
 * DHYAN DO: ye wapas nahi ho sakta — chalane se pehle confirm kar lo.
 *********************************************************************/
function resetAllRequests() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('Sheet pehle se khali hai — kuch delete nahi kiya.');
    return;
  }
  var count = lastRow - 1;
  sheet.deleteRows(2, count);
  Logger.log(count + ' test rows delete ho gayi. Agli request DSL001 se shuru hogi.');
}
