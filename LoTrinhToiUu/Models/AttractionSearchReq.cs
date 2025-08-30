namespace LoTrinhToiUu.Models
{
    public class AttractionSearchReq
    {
        public double[] Center { get; set; } = new double[2]; // [lng, lat]
        public double RadiusKm { get; set; } = 5;             // Bán kính tìm kiếm
        public string Keyword { get; set; } = "tourism";     // Loại POI
    }
}
