import * as fs from "fs";
import * as path from "path";
import { supabase } from "./supabase";

export async function uploadFileToSupabase(
    localFilePath: string,
    folder: string
) {
    const fileBuffer = fs.readFileSync(localFilePath);

    const fileName =
        Date.now() + "-" + path.basename(localFilePath);

    const bucket = process.env.SUPABASE_BUCKET!;
    console.log("SUPABASE_BUCKET =", process.env.SUPABASE_BUCKET);

    const { error } = await supabase.storage
        .from(bucket)
        .upload(`${folder}/${fileName}`, fileBuffer, {
            upsert: false,
        });

    if (error) {
        throw new Error(error.message);
    }

    const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(`${folder}/${fileName}`);

    try {
        fs.unlinkSync(localFilePath);
    } catch (err) {
        console.log("File cleanup failed:", err);
    }

    return data.publicUrl;
}