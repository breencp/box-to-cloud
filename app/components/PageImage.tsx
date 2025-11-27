"use client";

import { useState } from "react";

interface PageImageProps {
  s3Key: string;
  filename: string;
}

export function PageImage({ s3Key, filename }: PageImageProps) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleReset = () => setZoom(1);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-gray-500 dark:text-gray-400">
        <p>Unable to load image</p>
        <p className="font-mono text-xs break-all">{filename}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex gap-2 justify-center p-2 bg-white dark:bg-gray-800 rounded-lg mb-2">
        <button
          onClick={handleZoomOut}
          className="px-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg min-w-[60px] hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Zoom out (-)"
        >
          -
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg min-w-[60px] hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="px-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg min-w-[60px] hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Zoom in (+)"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center">
        <div
          className="transition-transform duration-200 origin-center"
          style={{ transform: `scale(${zoom})` }}
        >
          {/*
            Note: In production, replace this with an actual <img> tag
            pointing to the presigned S3 URL. For the initial setup,
            we show a placeholder since the images aren't uploaded yet.
          */}
          <div className="flex flex-col items-center justify-center gap-4 p-16 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 text-center min-w-[400px] min-h-[500px] max-sm:min-w-full max-sm:min-h-[300px] max-sm:p-8">
            <p>Document Page Preview</p>
            <p className="font-mono text-xs break-all">{s3Key}</p>
            <p className="text-xs italic">
              Images will be displayed here once uploaded to S3
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
