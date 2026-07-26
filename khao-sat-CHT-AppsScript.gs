// ═══════════════════════════════════════════
// Google Apps Script — Backend form Khảo sát CHT → QLKV
// ═══════════════════════════════════════════
// Cách deploy:
// 1. Mở Google Sheet mới (hoặc dùng Sheet có sẵn)
// 2. Extensions → Apps Script
// 3. Paste code này vào, thay SHEET_NAME nếu cần
// 4. Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy URL → gửi cho MsT để nhúng vào form

var SHEET_NAME = 'Responses';  // Tên sheet để lưu responses

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    
    // Tạo sheet nếu chưa có
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
      sheet.appendRow([
        'Timestamp', 'Họ và tên', 'SĐT', 'Ngày sinh', 'Mã NV', 'GĐV', 'Tỉnh/TP', 'QLKV', 'Mã CHT / CH',
        'Trình độ', 'Chuyên ngành', 'Trường', 'Chứng chỉ',
        'TG làm CHT', 'TG làm CH hiện tại', 'KPI CH', 'Điểm mạnh',
        'Ngày vào WCM', 'Vị trí đầu tiên', 'Vị trí hiện tại', 'Các vị trí WCM', 'Thành tích WCM',
        'Từng làm trước WCM', 'Nơi làm trước', 'KN từ việc trước',
        'Vị trí mong muốn', 'TG mong muốn', 'Địa bàn mong muốn', 'VT/ĐB cụ thể',
        'KN cần đào tạo', 'Sẵn sàng đào tạo QLKV DB',
        'Đề xuất', 'Lý do làm QLKV'
      ]);
    }
    
    sheet.appendRow([
      new Date(),
      data.hoTen || '', data.sdt || '', data.ngaySinh || '', data.maNV || '', data.gdv || '', data.tinh || '', data.qlkv || '', data.ch || '',
      data.trinhDo || '', data.chuyenNganh || '', data.truong || '', data.chungChi || '',
      data.tgCht || '', data.tgChHienTai || '', data.kpi || '', data.diemManh || '',
      data.ngayVaoWcm || '', data.viTriDauTien || '', data.viTriHienTai || '', data.cacViTriWcm || '', data.thanhTich || '',
      data.tungLamTruoc || '', data.noiLamTruoc || '', data.knViecTruoc || '',
      data.viTriMongMuon || '', data.tgMongMuon || '', data.diaBanMongMuon || '', data.vtDbCuThe || '',
      data.knCanDaoTao || '', data.sanSangDaoTao || '',
      data.deXuat || '', data.lyDoLamQlkv || ''
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('✅ Backend OK — dùng POST để gửi dữ liệu');
}