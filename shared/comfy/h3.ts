import graph from "../../workflows/minimax-h3-omniref.json";
import type { ApiGraph } from "./slots";
import type { WorkflowTemplate } from "./workflow";

/** Sanitized API graph from the completed RGB/Canny/depth comparison.
 * Upstream: Comfy-Org/workflow_templates@67984637eefcd4825dcf5c134e39034785be1682,
 * video_fasth3_ominiref_r2v.json. References guide semantics, not exact poses.
 */
export function h3Workflow(
  guide: "rgb" | "canny" | "depth" | "combined",
): WorkflowTemplate {
  const nodes = JSON.parse(JSON.stringify(graph)) as ApiGraph;
  if (guide === "canny" || guide === "combined") {
    nodes["203"] = {
      class_type: "Canny",
      inputs: {
        image: ["202", 0],
        low_threshold: 0.2,
        high_threshold: 0.5,
      },
    };
    nodes["136"].inputs["ref_videos.ref_video_0"] = ["203", 0];
  }
  if (guide === "depth" || guide === "combined") {
    nodes["204"] = {
      class_type: "LoadDA3Model",
      inputs: {
        model_name: "depth_anything_3_small.safetensors",
        weight_dtype: "default",
      },
    };
    nodes["205"] = {
      class_type: "DA3Inference",
      inputs: {
        da3_model: ["204", 0],
        image: ["202", 0],
        resolution: 504,
        resize_method: "upper_bound_resize",
        mode: "mono",
      },
    };
    nodes["206"] = {
      class_type: "DA3Render",
      inputs: {
        da3_geometry: ["205", 0],
        output: "depth",
        "output.normalization": "v2_style",
        "output.apply_sky_clip": false,
      },
    };
    nodes["136"].inputs["ref_videos.ref_video_0"] = ["206", 0];
  }
  if (guide === "combined") {
    nodes["136"].inputs["ref_videos.ref_video_0"] = ["202", 0];
    nodes["136"].inputs["ref_videos.ref_video_1"] = ["203", 0];
    nodes["136"].inputs["ref_videos.ref_video_2"] = ["206", 0];
  }
  return {
    id: `minimax-h3-${guide}`,
    file: `workflows/minimax-h3-${guide}.json`,
    graph: nodes,
    slots: {
      prompt: { path: "138.value", kind: "text" },
      identity: { path: "137.image", kind: "image" },
      look: { path: "139.image", kind: "image" },
      guide: { path: "200.file", kind: "video" },
      unet_name: { path: "127.unet_name", kind: "model" },
      text_encoder: { path: "128.clip_name", kind: "model" },
      video_vae: { path: "119.vae_name", kind: "model" },
      audio_vae: { path: "120.vae_name", kind: "model" },
      ...(guide === "depth" || guide === "combined"
        ? { depth_model: { path: "204.model_name", kind: "model" as const } }
        : {}),
    },
    requiredNodes: [...new Set(Object.values(nodes).map((n) => n.class_type))],
    requiredModels: [
      graph["127"].inputs.unet_name,
      graph["128"].inputs.clip_name,
      graph["119"].inputs.vae_name,
      graph["120"].inputs.vae_name,
      ...(guide === "depth" || guide === "combined"
        ? ["depth_anything_3_small.safetensors"]
        : []),
    ],
    output: { nodeId: "92", media: "video" },
  };
}
