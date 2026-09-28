package kz.inkar.wasender.request;

import kz.inkar.wasender.sheets.SheetField;
import kz.inkar.wasender.sheets.SheetRow;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class RequestValidator {

    public List<SheetField> missingFields(SheetRow row) {
        return SheetField.REQUIRED.stream().filter(row::isBlank).toList();
    }

    public String errorText(List<SheetField> missing) {
        return RequestStatus.FAILED.sheetText() + ": не заполнено " + String.join(", ", missing.stream().map(SheetField::title).toList());
    }
}
