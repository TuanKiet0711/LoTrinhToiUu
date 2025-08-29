using CityTourApp.Models;
using Microsoft.EntityFrameworkCore;

namespace LoTrinhToiUu.Data
{
    public class CityTourContext : DbContext
    {
        public CityTourContext(DbContextOptions<CityTourContext> options) : base(options) { }

        public DbSet<Attraction> Attractions => Set<Attraction>();
        // (Nếu không dùng RoutePlans/RouteSteps có thể bỏ)
        // public DbSet<RoutePlan> RoutePlans => Set<RoutePlan>();
        // public DbSet<RouteStep> RouteSteps => Set<RouteStep>();
    }
}
