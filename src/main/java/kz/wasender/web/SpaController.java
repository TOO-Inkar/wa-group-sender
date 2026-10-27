package kz.wasender.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {
    @GetMapping({"/login", "/campaigns", "/campaigns/{*rest}", "/groups", "/connection", "/settings", "/platform", "/platform/{*rest}"})
    public String index() {
        return "forward:/index.html";
    }
}
