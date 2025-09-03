using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using LoTrinhToiUu.Data;               // DbContext
using CityTourApp.Models;              // Attraction
using CityTourApp.Models.ViewModels;   // RouteDetailsVM
using LoTrinhToiUu.Helpers;            // GeoHelper

namespace LoTrinhToiUu.Controllers
{
    public class RouteController : Controller
    {
        private readonly CityTourContext _context;

        public RouteController(CityTourContext context)
        {
            _context = context;
        }

        /// <summary>
        /// Tính lộ trình giữa danh sách các điểm tham quan
        /// </summary>
        public async Task<IActionResult> Details([FromQuery] List<int> attractionIds)
        {
            if (attractionIds == null || attractionIds.Count == 0)
                return BadRequest("Chưa chọn điểm tham quan.");

            var attractions = await _context.Attractions
                .Where(a => attractionIds.Contains(a.Id))
                .ToListAsync();

            if (attractions.Count == 0)
                return NotFound("Không tìm thấy danh thắng.");

            double totalDistance = 0;

            // Tính tổng khoảng cách theo danh sách
            for (int i = 0; i < attractions.Count - 1; i++)
            {
                totalDistance += GeoHelper.CalculateDistance(
                    (double)attractions[i].Lat, (double)attractions[i].Lng,
                    (double)attractions[i + 1].Lat, (double)attractions[i + 1].Lng
                );
            }

            // Ước lượng thời gian đi (ví dụ: 40 km/h)
            double estimatedTime = totalDistance / 40 * 60; // phút

            var vm = new RouteDetailsVM
            {
                Attractions = attractions,
                TotalDistance = totalDistance,
                EstimatedTime = estimatedTime
            };

            return View(vm);
        }
    }
}
