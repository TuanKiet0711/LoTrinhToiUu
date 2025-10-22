using LoTrinhToiUu.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.Cookies;

var builder = WebApplication.CreateBuilder(args);

// ======================================================
// 🔧 ĐĂNG KÝ DỊCH VỤ (Dependency Injection)
// ======================================================

// MVC + Razor Views
builder.Services.AddControllersWithViews();

// Cho phép sử dụng HttpClient trong các service hoặc controller
builder.Services.AddHttpClient();

// ✅ Sửa lỗi InvalidOperationException: IHttpContextAccessor chưa đăng ký
builder.Services.AddHttpContextAccessor();

// DbContext kết nối SQL Server
builder.Services.AddDbContext<CityTourContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// ✅ Cấu hình Session (giữ đăng nhập, thông tin người dùng)
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromHours(2); // Tự hết hạn sau 2h không hoạt động
    options.Cookie.HttpOnly = true;              // Bảo mật cookie (chỉ truy cập từ server)
    options.Cookie.IsEssential = true;           // Bắt buộc để session hoạt động ngay cả khi tắt tracking
});

// ✅ Cấu hình Cookie Authentication (đăng nhập/đăng xuất)
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.LoginPath = "/TaiKhoan/DangNhap";   // Trang đăng nhập mặc định
        options.LogoutPath = "/TaiKhoan/DangXuat";  // Trang đăng xuất
        options.AccessDeniedPath = "/TaiKhoan/KhongDuQuyen"; // (tuỳ chọn)
        options.SlidingExpiration = true;           // Tự động gia hạn khi hoạt động
        options.ExpireTimeSpan = TimeSpan.FromHours(2); // Hết hạn cookie sau 2h
    });

// ======================================================
// 🚀 XÂY DỰNG ỨNG DỤNG
// ======================================================
var app = builder.Build();

// ======================================================
// 🧱 CẤU HÌNH MIDDLEWARE PIPELINE
// ======================================================
if (!app.Environment.IsDevelopment())
{
    // Dùng trang lỗi mặc định nếu không ở môi trường dev
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

// Thứ tự rất quan trọng:
app.UseSession();        // ✅ Bắt buộc trước Auth
app.UseAuthentication(); // ✅ Đăng nhập cookie
app.UseAuthorization();  // ✅ Xác thực quyền

// ======================================================
// 🛣️ CẤU HÌNH ROUTE MẶC ĐỊNH
// ======================================================
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

// ======================================================
// 🚀 CHẠY ỨNG DỤNG
// ======================================================
app.Run();
