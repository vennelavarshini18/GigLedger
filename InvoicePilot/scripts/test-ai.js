import "dotenv/config";
import { parseNote } from "../src/ai.js";

console.log(JSON.stringify(await parseNote(
 // "did 5 hrs of logo work for Ravi Kumar, $40/hr, plus $60 for the brand colour guide, he pays in 2 weeks"
 "fixed Sam's website last week, he said 300 is fine"
), null, 2));