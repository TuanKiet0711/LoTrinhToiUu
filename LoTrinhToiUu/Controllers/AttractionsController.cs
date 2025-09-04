using LoTrinhToiUu.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
[Authorize]
public class AttractionsController : Controller
{
    
    private readonly CityTourContext _db;
    public AttractionsController(CityTourContext db) => _db = db;

    public IActionResult Index()
    {
        var data = _db.Attractions.ToList();  // lấy danh thắng từ DB
        return View(data);                    // truyền xuống View
    }
}
