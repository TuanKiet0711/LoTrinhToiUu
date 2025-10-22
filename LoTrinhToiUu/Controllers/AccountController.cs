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
using System.Collections.Generic;

namespace CityTourApp.Controllers
{
    public class TaiKhoanController : Controller
    {
        private readonly CityTourContext _context;
        public TaiKhoanController(CityTourContext context) => _context = context;

        // =============== ĐĂNG NHẬP ===============
        [AllowAnonymous]
        public IActionResult DangNhap(string returnUrl = null)
        {
            ViewBag.ReturnUrl = returnUrl;
            return View();
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [AllowAnonymous]
        public async Task<IActionResult> DangNhap(string email, string matkhau, string returnUrl = null)
        {
            var emailNorm = (email ?? string.Empty).Trim().ToLowerInvariant();
            var hashed = HashPassword(matkhau);

            var nd = _context.NguoiDung.FirstOrDefault(u => u.Email == emailNorm && u.MatKhau == hashed);

            if (nd != null)
            {
                HttpContext.Session.SetString("NguoiDungEmail", nd.Email);
                HttpContext.Session.SetString("NguoiDungHoTen", nd.HoTen ?? "");

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

                TempData["ToastMessage"] = $"Xin chào {nd.HoTen ?? nd.Email}! Đăng nhập thành công 🎉";

                if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl))
                    return Redirect(returnUrl);

                return RedirectToAction("Index", "Home");
            }

            ViewBag.Loi = "Sai email hoặc mật khẩu";
            ViewBag.ReturnUrl = returnUrl;
            return View();
        }

        // =============== ĐĂNG KÝ ===============
        [AllowAnonymous]
        public IActionResult DangKy() => View(new NguoiDung());

        [HttpPost]
        [ValidateAntiForgeryToken]
        [AllowAnonymous]
        public IActionResult DangKy(NguoiDung model, string nhaplaiMatKhau)
        {
            // ====== Kiểm tra họ tên ======
            if (string.IsNullOrWhiteSpace(model.HoTen))
                ModelState.AddModelError(nameof(model.HoTen), "Họ tên là bắt buộc.");

            // ====== Kiểm tra số điện thoại ======
            if (string.IsNullOrWhiteSpace(model.SoDienThoai) ||
                model.SoDienThoai.Length != 10 ||
                !model.SoDienThoai.All(char.IsDigit))
            {
                ModelState.AddModelError(nameof(model.SoDienThoai), "Số điện thoại phải gồm đúng 10 chữ số.");
            }

            // ====== Kiểm tra email ======
            var emailNorm = (model.Email ?? string.Empty).Trim().ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(emailNorm) || !TryValidEmail(emailNorm))
            {
                ModelState.AddModelError(nameof(model.Email), "Email không đúng định dạng.");
            }
            else if (!emailNorm.EndsWith("@gmail.com"))
            {
                // ✅ Chỉ nhận Gmail
                ModelState.AddModelError(nameof(model.Email), "Chỉ chấp nhận email có đuôi @gmail.com.");
            }

            model.Email = emailNorm;

            // ====== Kiểm tra mật khẩu ======
            if (string.IsNullOrEmpty(model.MatKhau))
                ModelState.AddModelError(nameof(model.MatKhau), "Mật khẩu là bắt buộc.");

            if (string.IsNullOrEmpty(nhaplaiMatKhau) || model.MatKhau != nhaplaiMatKhau)
                ModelState.AddModelError("NhapLaiMatKhau", "Mật khẩu nhập lại không khớp.");

            // ====== Kiểm tra email trùng ======
            if (!string.IsNullOrEmpty(model.Email) && _context.NguoiDung.Any(u => u.Email == model.Email))
                ModelState.AddModelError(nameof(model.Email), "Email đã tồn tại.");

            // ====== Nếu có lỗi thì trả về form ======
            if (!ModelState.IsValid)
            {
                ViewBag.DangKyLoi = "Vui lòng kiểm tra lại các trường thông tin.";
                return View(model);
            }

            // ====== Ghi vào DB ======
            model.HoTen = model.HoTen?.Trim();
            model.SoDienThoai = model.SoDienThoai?.Trim();
            model.MatKhau = HashPassword(model.MatKhau);

            _context.NguoiDung.Add(model);
            _context.SaveChanges();

            TempData["ToastMessage"] = "🎉 Đăng ký thành công! Bạn có thể đăng nhập ngay.";
            return RedirectToAction("DangNhap");
        }

        // =============== ĐĂNG XUẤT ===============
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DangXuat()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            HttpContext.Session.Clear();
            TempData["ToastMessage"] = "👋 Đăng xuất thành công.";
            return RedirectToAction("Index", "Home");
        }

        // =============== HÀM PHỤ ===============
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
