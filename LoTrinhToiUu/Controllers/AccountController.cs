using CityTourApp.Models;
using LoTrinhToiUu.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Net.Mail;
using System.Linq;
using System;
using System.Threading.Tasks;

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
            // Chuẩn hoá email để so khớp chính xác
            var emailNorm = (email ?? string.Empty).Trim().ToLowerInvariant();
            var hashed = HashPassword(matkhau);

            var nd = _context.NguoiDung.FirstOrDefault(u => u.Email == emailNorm && u.MatKhau == hashed);

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
            // ====== Server-side validations (KHÔNG sửa model) ======

            // 1) Họ tên
            if (string.IsNullOrWhiteSpace(model.HoTen))
                ModelState.AddModelError(nameof(model.HoTen), "Họ tên là bắt buộc.");

            // 2) SĐT 10 số
            if (string.IsNullOrWhiteSpace(model.SoDienThoai) ||
                model.SoDienThoai.Length != 10 ||
                !model.SoDienThoai.All(char.IsDigit))
            {
                ModelState.AddModelError(nameof(model.SoDienThoai), "Số điện thoại phải gồm đúng 10 chữ số.");
            }

            // 3) Email: chuẩn hoá + kiểm tra định dạng
            var emailNorm = (model.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(emailNorm) || !TryValidEmail(emailNorm))
                ModelState.AddModelError(nameof(model.Email), "Email không đúng định dạng.");
            model.Email = emailNorm; // lưu lowercase

            // 4) Mật khẩu & nhập lại
            if (string.IsNullOrEmpty(model.MatKhau))
                ModelState.AddModelError(nameof(model.MatKhau), "Mật khẩu là bắt buộc.");
            if (string.IsNullOrEmpty(nhaplaiMatKhau) || model.MatKhau != nhaplaiMatKhau)
                ModelState.AddModelError("NhapLaiMatKhau", "Mật khẩu nhập lại không khớp.");

            // 5) Trùng email
            if (!string.IsNullOrEmpty(model.Email) && _context.NguoiDung.Any(u => u.Email == model.Email))
                ModelState.AddModelError(nameof(model.Email), "Email đã tồn tại.");

            if (!ModelState.IsValid)
            {
                ViewBag.DangKyLoi = "Vui lòng kiểm tra lại các trường thông tin.";
                return View(model);
            }

            // ====== Lưu DB ======
            model.HoTen = model.HoTen?.Trim();
            model.SoDienThoai = model.SoDienThoai?.Trim();
            model.MatKhau = HashPassword(model.MatKhau); // lưu HASH

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

        // ====== Helpers ======
        private static bool TryValidEmail(string email)
        {
            try { _ = new MailAddress(email); return true; }
            catch { return false; }
        }

        private string HashPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password ?? ""));
            return Convert.ToBase64String(bytes);
        }
    }
}
