import { Sandbox } from "@e2b/desktop";
import sharp from "sharp";

// Configuration constants
const MAX_RESOLUTION_WIDTH = 1920;
const MAX_RESOLUTION_HEIGHT = 1080;
const MIN_RESOLUTION_WIDTH = 800;
const MIN_RESOLUTION_HEIGHT = 600;

/**
 * ResolutionScaler handles resolution scaling between the original desktop
 * resolution and the scaled model resolution, including coordinate transformations
 * and screenshot scaling.
 */
export class ResolutionScaler {
  private desktop: Sandbox;
  private originalResolution: [number, number];
  private scaledResolution: [number, number];
  private scaleFactor: number;
  private originalAspectRatio: number;
  private scaledAspectRatio: number;

  constructor(desktop: Sandbox, originalResolution: [number, number]) {
    this.desktop = desktop;
    this.originalResolution = originalResolution;
    this.originalAspectRatio = originalResolution[0] / originalResolution[1];

    const { scaledResolution, scaleFactor } =
      this.calculateScaledResolution(originalResolution);
    this.scaledResolution = scaledResolution;
    this.scaleFactor = scaleFactor;
    this.scaledAspectRatio = scaledResolution[0] / scaledResolution[1];

    this.validateCoordinateScaling();
  }

  public getOriginalResolution(): [number, number] {
    return this.originalResolution;
  }

  public getScaledResolution(): [number, number] {
    return this.scaledResolution;
  }

  public getScaleFactor(): number {
    return this.scaleFactor;
  }

  public getOriginalAspectRatio(): number {
    return this.originalAspectRatio;
  }

  public getScaledAspectRatio(): number {
    return this.scaledAspectRatio;
  }

  private validateCoordinateScaling(): void {
    const testPoints: Array<{ name: string; point: [number, number] }> = [
      { name: "Top-left corner", point: [0, 0] },
      { name: "Top-right corner", point: [this.originalResolution[0] - 1, 0] },
      {
        name: "Bottom-left corner",
        point: [0, this.originalResolution[1] - 1],
      },
      {
        name: "Bottom-right corner",
        point: [this.originalResolution[0] - 1, this.originalResolution[1] - 1],
      },
      {
        name: "Center",
        point: [
          Math.floor(this.originalResolution[0] / 2),
          Math.floor(this.originalResolution[1] / 2),
        ],
      },
    ];

    for (const { point } of testPoints) {
      this.testCoordinateRoundTrip(point);
    }
  }

  public scaleToOriginalSpace(coordinate: [number, number]): [number, number] {
    const exactScaledX = coordinate[0] / this.scaleFactor;
    const exactScaledY = coordinate[1] / this.scaleFactor;

    const finalX = Math.round(exactScaledX);
    const finalY = Math.round(exactScaledY);

    return [finalX, finalY];
  }

  public scaleToModelSpace(coordinate: [number, number]): [number, number] {
    const exactScaledX = coordinate[0] * this.scaleFactor;
    const exactScaledY = coordinate[1] * this.scaleFactor;

    const finalX = Math.round(exactScaledX);
    const finalY = Math.round(exactScaledY);

    return [finalX, finalY];
  }

  public testCoordinateRoundTrip(originalCoordinate: [number, number]): {
    original: [number, number];
    modelSpace: [number, number];
    roundTrip: [number, number];
    error: [number, number];
  } {
    const modelSpace = this.scaleToModelSpace(originalCoordinate);
    const roundTrip = this.scaleToOriginalSpace(modelSpace);

    const error: [number, number] = [
      roundTrip[0] - originalCoordinate[0],
      roundTrip[1] - originalCoordinate[1],
    ];

    return { original: originalCoordinate, modelSpace, roundTrip, error };
  }

  public async takeScreenshot(): Promise<Buffer> {
    const originalScreenshot = await this.desktop.screenshot();
    return this.scaleScreenshot(originalScreenshot, this.scaledResolution);
  }

  private calculateScaledResolution(originalResolution: [number, number]): {
    scaledResolution: [number, number];
    scaleFactor: number;
  } {
    const [originalWidth, originalHeight] = originalResolution;

    // If already within bounds, no scaling needed
    if (
      originalWidth <= MAX_RESOLUTION_WIDTH &&
      originalHeight <= MAX_RESOLUTION_HEIGHT &&
      originalWidth >= MIN_RESOLUTION_WIDTH &&
      originalHeight >= MIN_RESOLUTION_HEIGHT
    ) {
      return {
        scaledResolution: originalResolution,
        scaleFactor: 1,
      };
    }

    // Calculate scale factors for both dimensions
    const widthScaleFactor = MAX_RESOLUTION_WIDTH / originalWidth;
    const heightScaleFactor = MAX_RESOLUTION_HEIGHT / originalHeight;

    // Use the smaller scale factor to maintain aspect ratio
    const scaleFactor = Math.min(widthScaleFactor, heightScaleFactor);

    const scaledWidth = Math.round(originalWidth * scaleFactor);
    const scaledHeight = Math.round(originalHeight * scaleFactor);

    return {
      scaledResolution: [scaledWidth, scaledHeight],
      scaleFactor,
    };
  }

  private async scaleScreenshot(
    screenshot: Buffer | Uint8Array,
    targetResolution: [number, number]
  ): Promise<Buffer> {
    const buffer = Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
    
    return sharp(buffer)
      .resize(targetResolution[0], targetResolution[1], {
        fit: "fill",
        kernel: "lanczos3",
      })
      .png()
      .toBuffer();
  }
} 