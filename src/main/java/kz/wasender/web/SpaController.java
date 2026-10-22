package kz.wasender.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Админка — одностраничное приложение (frontend/): адреса вроде /campaigns/12 отдают index.html,
 * дальше маршрут разбирает React. /api и файлы с расширением сюда не попадают.
 */
@Controller
public class SpaController {

    @GetMapping({"/login", "/campaigns", "/campaigns/{*rest}", "/groups", "/connection", "/settings"})
    public String index() {
        return "forward:/index.html";
    }
}
