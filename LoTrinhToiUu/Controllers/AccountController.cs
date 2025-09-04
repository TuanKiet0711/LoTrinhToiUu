using CityTourApp.Models;
using LoTrinhToiUu.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Linq;

namespace CityTourApp.Controllers
{
    public class TaiKhoanController : Controller
    {
        private readonly CityTourContext _context;
        public TaiKhoanController(CityTourContext context) => _context = context;

        // GET: /TaiKhoan/DangNhap
        [AllowAnonymous]
        public IActionResult DangNhap(string returnUrl = null)
        {
            ViewBag.ReturnUrl = returnUrl;
            return View();
        }

        // POST: /TaiKhoan/DangNhap
        [HttpPost]
        [ValidateAntiForgeryToken]
        [AllowAnonymous]
        public async Task<IActionResult> DangNhap(string email, string matkhau, string returnUrl = null)
        {
            var hashed = HashPassword(matkhau);
            var nd = _context.NguoiDung.FirstOrDefault(u => u.Email == email && u.MatKhau == hashed);

            if (nd != null)
            {
                // (tuỳ chọn) lưu session để hiển thị tên ở view
                HttpContext.Session.SetString("NguoiDungEmail", nd.Email);
                HttpContext.Session.SetString("NguoiDungHoTen", nd.HoTen ?? "");

                // 🔑 tạo cookie đăng nhập
                var claims = new List<Claim>
                {
                    new Claim(ClaimTypes.NameIdentifier, nd.Email),
                    new Claim(ClaimTypes.Name, nd.HoTen ?? nd.Email),
                    new Claim(ClaimTypes.Email, nd.Email)
                };

                var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
                var principal = new ClaimsPrincipal(identity);

                await HttpContext.SignInAsync(
                    CookieAuthenticationDefaults.AuthenticationScheme,
                    principal,
                    new AuthenticationProperties
                    {
                        IsPersistent = true,
                        ExpiresUtc = DateTimeOffset.UtcNow.AddHours(2)
                    });

                if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl))
                    return Redirect(returnUrl);

                return RedirectToAction("Index", "Home");
            }

            ViewBag.Loi = "Sai email hoặc mật khẩu";
            ViewBag.ReturnUrl = returnUrl;
            return View();
        }

        // GET: /TaiKhoan/DangKy
        [AllowAnonymous]
        public IActionResult DangKy() => View(new NguoiDung());

        // POST: /TaiKhoan/DangKy
        [HttpPost]
        [ValidateAntiForgeryToken]
        [AllowAnonymous]
        public IActionResult DangKy(NguoiDung model, string nhaplaiMatKhau)
        {
            // Kiểm tra SĐT 10 số
            if (string.IsNullOrWhiteSpace(model.SoDienThoai) ||
                model.SoDienThoai.Length != 10 ||
                !model.SoDienThoai.All(char.IsDigit))
            {
                ModelState.AddModelError(nameof(model.SoDienThoai), "Số điện thoại phải gồm đúng 10 chữ số.");
            }

            // Kiểm tra nhập lại mật khẩu
            if (string.IsNullOrEmpty(model.MatKhau) || string.IsNullOrEmpty(nhaplaiMatKhau) || model.MatKhau != nhaplaiMatKhau)
            {
                ModelState.AddModelError("NhapLaiMatKhau", "Mật khẩu nhập lại không khớp.");
            }

            // (khuyến nghị) kiểm tra trùng email
            if (!string.IsNullOrEmpty(model.Email) && _context.NguoiDung.Any(u => u.Email == model.Email))
            {
                ModelState.AddModelError(nameof(model.Email), "Email đã tồn tại.");
            }

            if (!ModelState.IsValid)
            {
                ViewBag.DangKyLoi = "Vui lòng kiểm tra lại các trường thông tin.";
                return View(model);
            }

            // Lưu
            model.MatKhau = HashPassword(model.MatKhau);
            _context.NguoiDung.Add(model);
            _context.SaveChanges();

            return RedirectToAction("DangNhap");
        }

        // POST: /TaiKhoan/DangXuat
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DangXuat()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            HttpContext.Session.Clear();
            return RedirectToAction("Index", "Home");
        }

        private string HashPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password ?? ""));
            return Convert.ToBase64String(bytes);
        }
    }
}
