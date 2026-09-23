import request from "supertest";
import app from "../src/app.js";


describe("Health API",()=>{

    it("should return UP", async()=>{

        const response =
            await request(app)
            .get("/health");


        expect(response.status).toBe(200);

        expect(response.body.status)
        .toBe("UP");

    });

});