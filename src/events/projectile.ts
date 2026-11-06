/**
 * Shared flight maths for jumps and throws. Positions are in metres:
 * x along the ground, y height above it. Uses the exact formula rather than
 * stepping, so the landing point doesn't depend on the frame rate.
 */
export class Projectile {
  x = 0; // m
  y = 0; // m
  landed = false;
  private x0 = 0;
  private y0 = 0;
  private vx = 0; // m/s
  private vy = 0; // m/s at launch
  private t = 0; // s since launch

  constructor(private readonly gravity: number) {}

  /** Height (m) it comes down at: 0 is the ground; a high-jump mat is higher. */
  private floor = 0;

  launch(x: number, y: number, speed: number, angleDegrees: number, floor = 0): void {
    const a = (angleDegrees * Math.PI) / 180;
    this.floor = floor;
    this.x0 = this.x = x;
    this.y0 = this.y = y;
    this.vx = speed * Math.cos(a);
    this.vy = speed * Math.sin(a);
    this.t = 0;
    this.landed = false;
  }

  /** Time from launch until it comes down to its landing height. */
  get flightTime(): number {
    const g = this.gravity;
    return (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * g * (this.y0 - this.floor)))) / g;
  }

  /** Change the landing height before the flight starts (e.g. it comes down short of the mat). */
  setFloor(height: number): void {
    this.floor = height;
  }

  /** Upward speed right now (m/s): positive while rising. */
  get vyNow(): number {
    return this.vy - this.gravity * this.t;
  }

  /** Launch speed (m/s). */
  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Where it will come down (m along the ground). */
  get landingX(): number {
    return this.x0 + this.vx * this.flightTime;
  }

  update(dt: number): void {
    if (this.landed) return;
    this.t = Math.min(this.t + dt, this.flightTime);
    this.x = this.x0 + this.vx * this.t;
    this.y = Math.max(this.floor, this.y0 + this.vy * this.t - 0.5 * this.gravity * this.t * this.t);
    if (this.t >= this.flightTime) {
      this.landed = true;
      this.y = this.floor;
    }
  }

  /**
   * Height (m) on this flight path when it passes `x` m along, or null if it
   * lands before getting there. Exact, so it doesn't depend on frame timing.
   */
  heightAt(x: number): number | null {
    if (this.vx <= 0) return null;
    const t = (x - this.x0) / this.vx;
    if (t < 0 || t > this.flightTime) return null;
    return this.y0 + this.vy * t - 0.5 * this.gravity * t * t;
  }

  /** Direction of travel right now, in degrees (for tilting a javelin). */
  get headingDegrees(): number {
    const vyNow = this.vy - this.gravity * this.t;
    return (Math.atan2(vyNow, this.vx) * 180) / Math.PI;
  }
}

/** Distance travelled on flat ground: v² · sin(2θ) / g. */
export function flatRange(speed: number, angleDegrees: number, gravity: number): number {
  return (speed * speed * Math.sin((2 * angleDegrees * Math.PI) / 180)) / gravity;
}
