namespace CityTourApp.Models
{
    public class NguoiDung
    {
        public int Id { get; set; }
        public string HoTen { get; set; } = default!;
        public string SoDienThoai { get; set; } = default!;
        public string Email { get; set; } = default!;
        public string MatKhau { get; set; } = default!; // Lưu mật khẩu đã hash
    }
}
