// Controllers/DirectionsController.cs
using Microsoft.AspNetCore.Mvc;
using System.Text;

namespace LoTrinhToiUu.Controllers;

[ApiController]
[Route("api")]
public class DirectionsController : ControllerBase
{
    private readonly HttpClient _http;
    private readonly IConfiguration _cfg;
    public DirectionsController(IHttpClientFactory f, IConfiguration cfg)
    { _http = f.CreateClient(); _cfg = cfg; }

    // POST /api/coach-route
    // Body: { "coords":[[lng,lat],...], "vehicle":{...}, "avoidSmallRoads": true }
    [HttpPost("coach-route")]
    public async Task<IActionResult> CoachRoute([FromBody] CoachRouteReq req)
    {
        if (req?.Coords == null || req.Coords.Count < 2)
            return BadRequest("Cần ít nhất 2 điểm [lng,lat].");

        var apiKey = _cfg["ORS:ApiKey"] ?? "";
        var url = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson";

        // payload cơ bản
        var payload = new Dictionary<string, object?>
        {
            ["coordinates"] = req.Coords,
            ["instructions"] = true,
            ["preference"] = "fastest",
            ["geometry"] = true
        };

        // nếu yêu cầu tránh đường nhỏ
        if (req.AvoidSmallRoads)
        {
            // Chỉ những avoid_features hợp lệ với profile driving-hgv
            string[] validAvoidFeaturesHGV = new[] { "fords", "ferries" };

            payload["options"] = new
            {
                avoid_features = validAvoidFeaturesHGV
            };
        }



        var json = System.Text.Json.JsonSerializer.Serialize(payload);
        var msg = new HttpRequestMessage(HttpMethod.Post, url);
        msg.Headers.TryAddWithoutValidation("Authorization", apiKey);
        msg.Content = new StringContent(json, Encoding.UTF8, "application/json");

        var res = await _http.SendAsync(msg);
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) return StatusCode((int)res.StatusCode, body);
        return Content(body, "application/json");
    }

    // POST /api/coach-route-optimal
    [HttpPost("coach-route-optimal")]
    public async Task<IActionResult> CoachRouteOptimal([FromBody] CoachRouteReq req)
    {
        if (req?.Coords == null || req.Coords.Count < 2)
            return BadRequest("Cần ít nhất 2 điểm [lng,lat].");

        var apiKey = _cfg["ORS:ApiKey"] ?? "";
        var url = "https://api.openrouteservice.org/optimization";

        var jobs = req.Coords.Skip(1).Select((c, i) => new
        {
            id = i + 1,
            location = c
        }).ToList();

        var vehicle = new
        {
            id = 1,
            profile = "driving-car",   // ORS optimization chỉ hỗ trợ profile chuẩn
            start = req.Coords.First()
        };

        var payload = new { jobs, vehicles = new[] { vehicle } };

        var json = System.Text.Json.JsonSerializer.Serialize(payload);
        var msg = new HttpRequestMessage(HttpMethod.Post, url);
        msg.Headers.Add("Authorization", apiKey);
        msg.Content = new StringContent(json, Encoding.UTF8, "application/json");

        var res = await _http.SendAsync(msg);
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) return StatusCode((int)res.StatusCode, body);
        return Content(body, "application/json");
    }

    // Models
    public class CoachRouteReq
    {
        public List<double[]> Coords { get; set; } = new(); // [[lng,lat],...]
        public VehicleSpec? Vehicle { get; set; }
        public bool AvoidSmallRoads { get; set; } = true;   // mặc định tránh đường nhỏ
    }
    public class VehicleSpec
    {
        public double WeightTons { get; set; } = 15.0;
        public double Height { get; set; } = 3.5;
        public double Width { get; set; } = 2.5;
        public double Length { get; set; } = 12.0;
    }
}
