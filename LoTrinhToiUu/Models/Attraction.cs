namespace CityTourApp.Models
{
    public class Attraction
    {
        public int Id { get; set; }
        public string Ten { get; set; } = default!;
        public decimal Lat { get; set; }
        public decimal Lng { get; set; }
        public string? DiaChi { get; set; }
        public string? Tags { get; set; } // ví dụ: "lichsu,kientruc"
    }
}
